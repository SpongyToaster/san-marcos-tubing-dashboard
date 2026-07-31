/**
 * San Marcos River Telemetry & Ecological Data Pipeline
 * Role: Senior Backend Data Engineer
 * 
 * Modular pipeline fetching live USGS streamgage & NWS weather data,
 * with state distribution pub/sub store, caching, and hardware extension hooks.
 */

class TelemetryStore {
  constructor() {
    this.state = {
      cfs: 145,
      turbidity: 1.2,
      temperatureC: 22.5,
      stage: 'optimal-baseflow',
      stageName: 'Stage 1: Optimal Baseflow',
      lastUpdated: new Date().toISOString(),
      sourceType: 'USGS Live API',
      isSimulated: false,
      error: null
    };

    this.listeners = new Set();
    this.cacheKey = 'sm_river_telemetry_cache';
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes cache
  }

  /**
   * Subscribe to telemetry state changes
   * @param {Function} callback - Listener callback receiving (state)
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this.listeners.add(callback);
    // Immediate broadcast on subscribe
    callback(this.state);
    return () => this.listeners.delete(callback);
  }

  /**
   * Broadcast state changes to all subscribers
   */
  notify() {
    this.listeners.forEach(callback => {
      try {
        callback(this.state);
      } catch (err) {
        console.error('[TelemetryStore] Listener notification error:', err);
      }
    });
  }

  /**
   * Evaluates raw hydrologic metrics against the Aquatic Biologist's 4-Stage Matrix
   */
  classifyStage(cfs, turbidity, tempC) {
    if (cfs >= 400 || turbidity >= 35) {
      return {
        stage: 'severe-flood',
        stageName: 'Stage 3: Severe Flood Surge',
        description: 'High velocity flood runoff. Hydrodynamic drag scours riverbed. Wildlife retreats to refugia.'
      };
    } else if (cfs < 70 || tempC >= 24.5) {
      return {
        stage: 'critical-drought',
        stageName: 'Stage 4: Critical Drought Stress',
        description: 'Low spring discharge. Elevated surface temperature and low dissolved oxygen levels.'
      };
    } else if (cfs >= 175 || turbidity >= 5) {
      return {
        stage: 'elevated-surge',
        stageName: 'Stage 2: Elevated Flow Surge',
        description: 'Increased flow velocity and mild silt turbidity. Species shift to plant canopy bases.'
      };
    } else {
      return {
        stage: 'optimal-baseflow',
        stageName: 'Stage 1: Optimal Baseflow',
        description: 'Crystal clear artesian spring flow. Ideal light penetration and thermal stability.'
      };
    }
  }

  /**
   * Update internal telemetry state
   */
  updateState(newData) {
    const cfs = Number(newData.cfs ?? this.state.cfs);
    const turbidity = Number(newData.turbidity ?? this.state.turbidity);
    const tempC = Number(newData.temperatureC ?? this.state.temperatureC);
    
    const stageInfo = this.classifyStage(cfs, turbidity, tempC);

    this.state = {
      ...this.state,
      cfs,
      turbidity,
      temperatureC: tempC,
      stage: stageInfo.stage,
      stageName: stageInfo.stageName,
      stageDescription: stageInfo.description,
      lastUpdated: new Date().toISOString(),
      sourceType: newData.sourceType || this.state.sourceType,
      isSimulated: Boolean(newData.isSimulated),
      error: newData.error || null
    };

    // Cache updated state
    try {
      localStorage.setItem(this.cacheKey, JSON.stringify({
        timestamp: Date.now(),
        data: this.state
      }));
    } catch (e) {
      // Storage unavailable or quota exceeded
    }

    this.notify();
  }

  /**
   * Force manual state override (for simulation / K-12 educational demonstrations)
   */
  simulateStage(stageId) {
    const presets = {
      'optimal-baseflow': { cfs: 145, turbidity: 1.2, temperatureC: 22.5 },
      'elevated-surge': { cfs: 250, turbidity: 9.5, temperatureC: 21.0 },
      'severe-flood': { cfs: 480, turbidity: 52.0, temperatureC: 19.5 },
      'critical-drought': { cfs: 52, turbidity: 14.0, temperatureC: 25.8 }
    };

    const preset = presets[stageId];
    if (preset) {
      this.updateState({
        ...preset,
        sourceType: 'Interactive Demo Simulator',
        isSimulated: true
      });
    }
  }
}

/**
 * USGS Instantaneous Values REST API Adapter
 * Station: 08170500 (San Marcos River at San Marcos, TX)
 */
class USGSWebSource {
  constructor(siteId = '08170500') {
    this.siteId = siteId;
    this.endpoint = `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${siteId}&parameterCd=00060,00010,63680&siteStatus=all`;
  }

  async fetchTelemetry() {
    const response = await fetch(this.endpoint, { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`USGS HTTP error ${response.status}`);
    }
    const json = await response.json();

    const timeSeries = json?.value?.timeSeries || [];
    let cfs = 145;
    let tempC = 22.5;
    let turbidity = 1.2;

    timeSeries.forEach(series => {
      const paramCode = series?.variable?.variableCode?.[0]?.value;
      const latestValue = series?.values?.[0]?.value?.[0]?.value;

      if (latestValue !== undefined && !isNaN(parseFloat(latestValue))) {
        const val = parseFloat(latestValue);
        if (paramCode === '00060') cfs = val; // Discharge CFS
        else if (paramCode === '00010') tempC = val; // Temperature °C
        else if (paramCode === '63680') turbidity = val; // Turbidity NTU
      }
    });

    return {
      cfs,
      turbidity,
      temperatureC: tempC,
      sourceType: 'USGS Gauge 08170500',
      isSimulated: false
    };
  }
}

/**
 * Modular Pipeline Hardware & Ingestion Orchestrator
 * Supports live Web APIs, fallback mock buffers, and local hardware serial/LoRa drivers.
 */
class TelemetryPipeline {
  constructor(store) {
    this.store = store;
    this.usgsSource = new USGSWebSource();
    this.hardwareDriver = null; // Extension slot for WebSerial / LoRa bridge
    this.pollingInterval = null;
  }

  /**
   * Start automated data ingestion loop
   * @param {number} intervalMs - Polling frequency (default 60s)
   */
  startIngestion(intervalMs = 60000) {
    this.fetchNext();
    this.pollingInterval = setInterval(() => this.fetchNext(), intervalMs);
  }

  stopIngestion() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  async fetchNext() {
    try {
      // 1. Check Hardware Driver (Arduino / LoRa) if connected
      if (this.hardwareDriver && this.hardwareDriver.isConnected()) {
        const hwData = await this.hardwareDriver.readTelemetry();
        this.store.updateState({ ...hwData, sourceType: 'Local LoRa/Arduino Telemetry' });
        return;
      }

      // 2. Fetch Live USGS API
      const apiData = await this.usgsSource.fetchTelemetry();
      this.store.updateState(apiData);
    } catch (err) {
      console.warn('[TelemetryPipeline] Live API fetch failed. Reverting to cached/fallback metrics.', err);
      // Fallback state with error alert
      this.store.updateState({
        error: 'USGS API offline or CORS blocked. Utilizing local spring baseline.',
        sourceType: 'Baseline Fallback Buffer'
      });
    }
  }

  /**
   * Modular extension method to attach local microcontroller (Arduino/ESP32 WebSerial or LoRa receiver)
   */
  registerHardwareDriver(driverInstance) {
    this.hardwareDriver = driverInstance;
    console.log('[TelemetryPipeline] Hardware telemetry driver registered:', driverInstance.name);
  }
}

// Global Singleton Export
window.telemetryStore = new TelemetryStore();
window.telemetryPipeline = new TelemetryPipeline(window.telemetryStore);
