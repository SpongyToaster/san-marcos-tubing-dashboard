/**
 * San Marcos River Telemetry & Ecological Data Pipeline
 * Role: Senior Backend Data Engineer
 * 
 * Modular pipeline fetching live USGS streamgage & NWS weather data,
 * with 5-species state distribution pub/sub store, caching, and hardware extension hooks.
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
      error: null,
      speciesCounts: {
        wildRiceStands: 52,
        fountainDartersPerM2: 5.2,
        cooterTurtles: 4,
        longearSunfish: 12,
        nativeCrayfishPerM2: 6
      }
    };

    this.listeners = new Set();
    this.cacheKey = 'sm_river_telemetry_cache';
  }

  subscribe(callback) {
    this.listeners.add(callback);
    callback(this.state);
    return () => this.listeners.delete(callback);
  }

  notify() {
    this.listeners.forEach(callback => {
      try {
        callback(this.state);
      } catch (err) {
        console.error('[TelemetryStore] Listener error:', err);
      }
    });
  }

  classifyStage(cfs, turbidity, tempC) {
    if (cfs >= 400 || turbidity >= 35) {
      return {
        stage: 'severe-flood',
        stageName: 'Stage 3: Severe Flood Surge',
        description: 'High velocity flood runoff (450+ CFS). Species take shelter in refugia eddies and rock crevices.',
        speciesCounts: {
          wildRiceStands: 45,
          fountainDartersPerM2: 2.1,
          cooterTurtles: 1,
          longearSunfish: 4,
          nativeCrayfishPerM2: 8
        }
      };
    } else if (cfs < 70 || tempC >= 24.5) {
      return {
        stage: 'critical-drought',
        stageName: 'Stage 4: Critical Drought Stress',
        description: 'Low spring discharge (<60 CFS). Thermal stress forces species into spring-head refuges.',
        speciesCounts: {
          wildRiceStands: 30,
          fountainDartersPerM2: 1.5,
          cooterTurtles: 5,
          longearSunfish: 15,
          nativeCrayfishPerM2: 3
        }
      };
    } else if (cfs >= 175 || turbidity >= 5) {
      return {
        stage: 'elevated-surge',
        stageName: 'Stage 2: Elevated Flow Surge',
        description: 'Increased flow velocity and mild turbidity. Species shift to plant canopy bases.',
        speciesCounts: {
          wildRiceStands: 50,
          fountainDartersPerM2: 4.8,
          cooterTurtles: 3,
          longearSunfish: 10,
          nativeCrayfishPerM2: 5
        }
      };
    } else {
      return {
        stage: 'optimal-baseflow',
        stageName: 'Stage 1: Optimal Baseflow',
        description: 'Crystal clear artesian spring flow. Ideal light penetration and thermal stability.',
        speciesCounts: {
          wildRiceStands: 55,
          fountainDartersPerM2: 5.5,
          cooterTurtles: 4,
          longearSunfish: 12,
          nativeCrayfishPerM2: 6
        }
      };
    }
  }

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
      speciesCounts: stageInfo.speciesCounts,
      lastUpdated: new Date().toISOString(),
      sourceType: newData.sourceType || this.state.sourceType,
      isSimulated: Boolean(newData.isSimulated),
      error: newData.error || null
    };

    try {
      localStorage.setItem(this.cacheKey, JSON.stringify({
        timestamp: Date.now(),
        data: this.state
      }));
    } catch (e) {}

    this.notify();
  }

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
        sourceType: 'Interactive Multi-Species Simulator',
        isSimulated: true
      });
    }
  }
}

class USGSWebSource {
  constructor(siteId = '08170500') {
    this.siteId = siteId;
    this.endpoint = `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${siteId}&parameterCd=00060,00010,63680&siteStatus=all`;
  }

  async fetchTelemetry() {
    const response = await fetch(this.endpoint, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`USGS HTTP error ${response.status}`);
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
        if (paramCode === '00060') cfs = val;
        else if (paramCode === '00010') tempC = val;
        else if (paramCode === '63680') turbidity = val;
      }
    });

    return { cfs, turbidity, temperatureC: tempC, sourceType: 'USGS Gauge 08170500', isSimulated: false };
  }
}

class TelemetryPipeline {
  constructor(store) {
    this.store = store;
    this.usgsSource = new USGSWebSource();
    this.hardwareDriver = null;
    this.pollingInterval = null;
  }

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
      if (this.hardwareDriver && this.hardwareDriver.isConnected()) {
        const hwData = await this.hardwareDriver.readTelemetry();
        this.store.updateState({ ...hwData, sourceType: 'Local LoRa/Arduino Telemetry' });
        return;
      }
      const apiData = await this.usgsSource.fetchTelemetry();
      this.store.updateState(apiData);
    } catch (err) {
      console.warn('[TelemetryPipeline] Live API fetch failed. Using spring baseline.', err);
      this.store.updateState({
        error: 'USGS API offline or CORS blocked. Utilizing local spring baseline.',
        sourceType: 'Baseline Fallback Buffer'
      });
    }
  }

  registerHardwareDriver(driverInstance) {
    this.hardwareDriver = driverInstance;
    console.log('[TelemetryPipeline] Hardware driver registered:', driverInstance.name);
  }
}

window.telemetryStore = new TelemetryStore();
window.telemetryPipeline = new TelemetryPipeline(window.telemetryStore);
