# 🌊 San Marcos River Tubing & Environmental Dashboard

A comprehensive, real-time Environmental & Recreational Dashboard for tubing the San Marcos River in San Marcos, TX.

![San Marcos River Tubing Dashboard](https://img.shields.io/badge/Status-Active-brightgreen)
![USGS Live Data](https://img.shields.io/badge/USGS-Site_08170500-blue)
![NWS Weather](https://img.shields.io/badge/NWS-EWX%2F161%2C54-cyan)

## 📊 Features

- **Live USGS Water Metrics**: Real-time streamflow (CFS), water temperature (~72°F spring-fed), dissolved oxygen (mg/L), pH level, and turbidity (NTU).
- **NWS Weather Integration**: Air temperature (°F) and forecast conditions for San Marcos, TX.
- **The Vibe Score**: Intelligent grading system (A+ to F) calculating real-time tubing safety and fun factor:
  - **A+ Chill & Float**: Ideal 150-250 CFS flow, clear water (<10 NTU), warm air (>80°F).
  - **B Booty Bumper**: Low water (<100 CFS) rock scraping warning.
  - **C Chocolate Milk**: Post-rain high turbidity (>50 NTU).
  - **F Biohazard or Washout**: High flood velocity (>500 CFS) or elevated bacterial counts (>399 cfu).
- **Eco-Impact Score**: Protects endangered **Texas Wild Rice** (*Zizania texana*) and **Fountain Darters** based on seasonal spawning and river flow levels.
- **Dynamic CSS Glows & Animations**: Visual card border styling with pulsing red danger aura for high-risk conditions.
- **Interactive Simulator**: Preset scenario buttons and sliders to test river flow, turbidity, temperature, and bacteria levels.
- **Municipal River Rules**: City of San Marcos ordinances (Can Ban, reusable container rules, mesh bag requirements).

## 🚀 Quick Start

Launch locally using any standard static file server:

```bash
# Using Python
python -m http.server 8085

# Or run the included PowerShell server
powershell -ExecutionPolicy Bypass -File server.ps1
```

Open `http://localhost:8085/` in your browser.

## 📄 License

MIT License - feel free to use and customize!
