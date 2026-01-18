// F1 Telemetry Dashboard - Main Logic

const API_BASE = 'http://localhost:8000';

// Team Colors (2024 Season)
const TEAM_COLORS = {
    'Mercedes': '#27F4D2',
    'Red Bull Racing': '#3671C6',
    'Ferrari': '#E8002D',
    'McLaren': '#FF8000',
    'Alpine': '#FF87BC',
    'RB': '#6692FF',
    'Aston Martin': '#229971',
    'Williams': '#64C4FF',
    'Kick Sauber': '#52E252',
    'Haas F1 Team': '#B6B6B6'
};

// Tire Compound Colors
const TIRE_COLORS = {
    'SOFT': '#DC2626',
    'MEDIUM': '#F59E0B',
    'HARD': '#4B5563',
    'INTERMEDIATE': '#059669',
    'WET': '#2563EB',
    'UNKNOWN': '#9CA3AF'
};

// Global state
let summaryData = null;
let strategyChart = null;
let comparisonChart = null;
let speedChart = null;
let rpmChart = null;
let activeDrivers = new Set();

// API Functions

async function fetchSummaryData() {
    try {
        const response = await fetch(`${API_BASE}?type=summary`);
        if (!response.ok) throw new Error('API Error');
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        return null;
    }
}

async function fetchTelemetryData(driverNumber, lapNumber) {
    try {
        const response = await fetch(`${API_BASE}?type=telemetry&driver_number=${driverNumber}&lap_number=${lapNumber}`);
        if (!response.ok) throw new Error('API Error');
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        return null;
    }
}

// UI Helper Functions

function updateStats(data) {
    let fastestLap = Infinity;
    let anomalyCount = 0;

    data.drivers.forEach(driver => {
        if (driver.stats.fastest_lap < fastestLap) {
            fastestLap = driver.stats.fastest_lap;
        }
        anomalyCount += driver.laps.filter(lap => lap.is_anomaly).length;
    });

    document.getElementById('fastest-lap').textContent = formatLapTime(fastestLap);
    document.getElementById('anomaly-count').textContent = anomalyCount;
}

function formatLapTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(3);
    return `${mins}:${secs.padStart(6, '0')}`;
}

function createDriverChips(data) {
    const container = document.getElementById('driver-chips');
    container.innerHTML = '';

    data.drivers.forEach(driver => {
        const chip = document.createElement('div');
        chip.className = 'driver-chip active';
        chip.style.color = driver.team_color;
        chip.dataset.driverNumber = driver.driver_number;

        chip.innerHTML = `
            <div class="team-dot" style="background: ${driver.team_color}"></div>
            ${driver.name_acronym}
        `;

        chip.addEventListener('click', () => toggleDriver(driver.driver_number, chip));
        container.appendChild(chip);

        activeDrivers.add(driver.driver_number);
    });
}

function toggleDriver(driverNumber, chip) {
    if (activeDrivers.has(driverNumber)) {
        activeDrivers.delete(driverNumber);
        chip.classList.remove('active');
    } else {
        activeDrivers.add(driverNumber);
        chip.classList.add('active');
    }
    updateStrategyChart();
}

// Chart Generation Functions

function createStrategyChart(data) {
    const ctx = document.getElementById('strategyChart').getContext('2d');

    // Destroy existing chart
    if (strategyChart) {
        strategyChart.destroy();
    }

    const datasets = data.drivers.map(driver => {
        // Filter anomalies - show only normal laps
        const normalLaps = driver.laps.filter(lap => !lap.is_anomaly && lap.lap_duration > 0 && lap.lap_duration < 120);

        return {
            label: driver.name_acronym,
            data: normalLaps.map(lap => ({
                x: lap.lap_number,
                y: lap.lap_duration,
                compound: lap.compound,
                isAnomaly: lap.is_anomaly,
                driverNumber: driver.driver_number,
                driverName: driver.full_name
            })),
            // Line color: Team color (static)
            borderColor: driver.team_color,
            backgroundColor: 'transparent',
            borderWidth: 2,
            // Point color: Tire color
            pointRadius: 3,
            pointBackgroundColor: ctx => {
                const dataPoint = ctx.raw;
                return dataPoint ? (TIRE_COLORS[dataPoint.compound] || '#9CA3AF') : '#9CA3AF';
            },
            pointBorderColor: driver.team_color,
            pointBorderWidth: 1,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: driver.team_color,
            tension: 0.2,
            hidden: false,
            spanGaps: false,
            driverNumber: driver.driver_number
        };
    });

    strategyChart = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'nearest',
                intersect: false
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    titleColor: '#1F2937',
                    bodyColor: '#1F2937',
                    borderColor: '#E5E7EB',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: true,
                    callbacks: {
                        title: (items) => {
                            if (items.length > 0) {
                                return `Lap ${items[0].raw.x}`;
                            }
                            return '';
                        },
                        label: (context) => {
                            const dataPoint = context.raw;
                            const lines = [
                                `${dataPoint.driverName}`,
                                `Time: ${formatLapTime(dataPoint.y)}`,
                                `Tyre: ${dataPoint.compound}`
                            ];
                            if (dataPoint.isAnomaly) {
                                lines.push('Anomaly Detected');
                            }
                            return lines;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    title: {
                        display: true,
                        text: 'Lap Number',
                        color: '#6B7280',
                        font: { weight: 600 }
                    },
                    grid: { color: '#E5E7EB' },
                    ticks: { color: '#6B7280' }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Lap Time (seconds)',
                        color: '#6B7280',
                        font: { weight: 600 }
                    },
                    grid: { color: '#E5E7EB' },
                    ticks: {
                        color: '#6B7280',
                        callback: value => formatLapTime(value)
                    }
                }
            },
            onClick: handleChartClick
        }
    });

    document.getElementById('strategy-loading').style.display = 'none';
}

function updateStrategyChart() {
    if (!strategyChart) return;

    strategyChart.data.datasets.forEach(dataset => {
        dataset.hidden = !activeDrivers.has(dataset.driverNumber);
    });

    strategyChart.update();
}

async function handleChartClick(event, elements) {
    if (elements.length === 0) return;

    const element = elements[0];
    const datasetIndex = element.datasetIndex;
    const index = element.index;
    const data = strategyChart.data.datasets[datasetIndex].data[index];

    const driverNumber = data.driverNumber;
    const lapNumber = data.x;
    const driverName = data.driverName;

    const section = document.getElementById('telemetry-section');
    section.classList.add('visible');

    document.getElementById('telemetry-info').innerHTML = `
        <div class="telemetry-badge">
            <span>Driver:</span>
            <span class="number">#${driverNumber}</span>
            <span>${driverName}</span>
        </div>
        <div class="telemetry-badge">
            <span>Lap:</span>
            <span class="number">${lapNumber}</span>
        </div>
    `;

    document.getElementById('speed-loading').style.display = 'flex';

    section.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const telemetryData = await fetchTelemetryData(driverNumber, lapNumber);

    document.getElementById('speed-loading').style.display = 'none';

    createTelemetryCharts(telemetryData);
}

function createTelemetryCharts(data) {
    const telemetry = data.telemetry;
    const labels = telemetry.map((_, i) => i);

    if (speedChart) speedChart.destroy();
    if (rpmChart) rpmChart.destroy();

    const speedCtx = document.getElementById('speedChart').getContext('2d');
    speedChart = new Chart(speedCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Speed (km/h)',
                data: telemetry.map(t => t.speed),
                borderColor: '#3B82F6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 2,
                fill: true,
                pointRadius: 0,
                tension: 0.2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    titleColor: '#1F2937',
                    bodyColor: '#1F2937',
                    borderColor: '#E5E7EB',
                    borderWidth: 1
                }
            },
            scales: {
                x: { display: false },
                y: {
                    title: {
                        display: true,
                        text: 'km/h',
                        color: '#6B7280'
                    },
                    grid: { color: '#E5E7EB' },
                    ticks: { color: '#6B7280' },
                    min: 0,
                    max: 350
                }
            }
        }
    });

    const rpmCtx = document.getElementById('rpmChart').getContext('2d');
    rpmChart = new Chart(rpmCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'RPM',
                    data: telemetry.map(t => t.rpm),
                    borderColor: '#F59E0B',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    pointRadius: 0,
                    tension: 0.2,
                    yAxisID: 'y'
                },
                {
                    label: 'Gear',
                    data: telemetry.map(t => t.gear),
                    borderColor: '#10B981',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    stepped: true,
                    pointRadius: 0,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: { usePointStyle: true, boxWidth: 8 }
                },
                tooltip: {
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    titleColor: '#1F2937',
                    bodyColor: '#1F2937',
                    borderColor: '#E5E7EB',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    display: true,
                    title: {
                        display: true,
                        text: 'Time (sample)',
                        color: '#6B7280'
                    },
                    grid: { color: '#E5E7EB' },
                    ticks: { color: '#6B7280' }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: { display: true, text: 'RPM', color: '#F59E0B' },
                    grid: { color: '#E5E7EB' },
                    ticks: { color: '#F59E0B' },
                    min: 5000,
                    max: 13000
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: { display: true, text: 'Gear', color: '#10B981' },
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#10B981', stepSize: 1 },
                    min: 0,
                    max: 9
                }
            }
        }
    });
}

function closeTelemetry() {
    document.getElementById('telemetry-section').classList.remove('visible');
}

function updateRaceSubtitle(data) {
    const subtitle = document.getElementById('race-subtitle');
    if (subtitle && data.event) {
        subtitle.textContent = `${data.event} • ${data.location || ''}`;
    }
}

function updateFastestLapInfo(data) {
    const container = document.getElementById('fastest-lap-info');
    const driverEl = document.getElementById('fastest-driver');
    const timeEl = document.getElementById('fastest-time');

    let fastestLap = null;
    let fastestDriver = null;

    for (const driver of data.drivers) {
        if (driver.stats && driver.stats.fastest_lap > 0) {
            if (!fastestLap || driver.stats.fastest_lap < fastestLap) {
                fastestLap = driver.stats.fastest_lap;
                fastestDriver = driver;
            }
        }
    }

    if (fastestDriver && fastestLap) {
        const minutes = Math.floor(fastestLap / 60);
        const seconds = (fastestLap % 60).toFixed(3);
        const timeStr = `${minutes}:${seconds.padStart(6, '0')}`;

        driverEl.textContent = `${fastestDriver.full_name} (${fastestDriver.name_acronym})`;
        timeEl.textContent = timeStr;
        container.style.display = 'flex';
        container.style.borderLeft = `4px solid ${fastestDriver.team_color}`;
    } else {
        container.style.display = 'none';
    }
}

function populateComparisonDropdowns(data) {
    const select1 = document.getElementById('driver1-select');
    const select2 = document.getElementById('driver2-select');

    const options = data.drivers.map(d =>
        `<option value="${d.driver_number}">${d.name_acronym} - ${d.full_name}</option>`
    ).join('');

    select1.innerHTML = options;
    select2.innerHTML = options;

    if (data.drivers.length >= 2) {
        select1.value = data.drivers[0].driver_number;
        select2.value = data.drivers[1].driver_number;
    }
}

function compareDrivers() {
    const driver1Num = parseInt(document.getElementById('driver1-select').value);
    const driver2Num = parseInt(document.getElementById('driver2-select').value);

    const driver1 = summaryData.drivers.find(d => d.driver_number === driver1Num);
    const driver2 = summaryData.drivers.find(d => d.driver_number === driver2Num);

    if (!driver1 || !driver2) return;

    createComparisonChart(driver1, driver2);
}

function createComparisonChart(driver1, driver2) {
    const ctx = document.getElementById('comparisonChart').getContext('2d');

    if (comparisonChart) {
        comparisonChart.destroy();
    }

    const maxLaps = Math.max(driver1.laps.length, driver2.laps.length);
    const labels = Array.from({ length: maxLaps }, (_, i) => i + 1);

    const data1 = labels.map(lap => {
        const lapData = driver1.laps.find(l => l.lap_number === lap);
        return lapData ? lapData.lap_duration : null;
    });

    const data2 = labels.map(lap => {
        const lapData = driver2.laps.find(l => l.lap_number === lap);
        return lapData ? lapData.lap_duration : null;
    });

    comparisonChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: driver1.name_acronym,
                    data: data1,
                    borderColor: driver1.team_color,
                    backgroundColor: driver1.team_color + '30',
                    borderWidth: 3,
                    pointRadius: 2,
                    tension: 0.1,
                    fill: false
                },
                {
                    label: driver2.name_acronym,
                    data: data2,
                    borderColor: driver2.team_color,
                    backgroundColor: driver2.team_color + '30',
                    borderWidth: 3,
                    pointRadius: 2,
                    tension: 0.1,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: { usePointStyle: true, font: { size: 14, weight: '600' } }
                },
                tooltip: {
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    titleColor: '#1F2937',
                    bodyColor: '#1F2937',
                    borderColor: '#E5E7EB',
                    borderWidth: 1,
                    callbacks: {
                        label: (context) => {
                            const value = context.raw;
                            if (!value) return '';
                            return `${context.dataset.label}: ${value.toFixed(3)}s`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Lap Number', color: '#6B7280', font: { weight: 600 } },
                    grid: { color: '#E5E7EB' },
                    ticks: { color: '#6B7280' }
                },
                y: {
                    title: { display: true, text: 'Lap Time (s)', color: '#6B7280', font: { weight: 600 } },
                    grid: { color: '#E5E7EB' },
                    ticks: { color: '#6B7280' }
                }
            }
        }
    });
}

// Initialization

async function init() {
    console.log('Starting F1 Telemetry Dashboard...');

    summaryData = await fetchSummaryData();
    console.log('Data loaded:', summaryData.event);

    updateRaceSubtitle(summaryData);
    updateStats(summaryData);
    createDriverChips(summaryData);
    createStrategyChart(summaryData);
    updateFastestLapInfo(summaryData);
    populateComparisonDropdowns(summaryData);
    populateLeaderboard();

    console.log('Dashboard ready!');
}


const SILVERSTONE_2024_RESULTS = [
    { pos: 1, name: 'Lewis Hamilton', acronym: 'HAM', team: 'Mercedes', teamColor: '#27F4D2', time: '1:22:27.095' },
    { pos: 2, name: 'Max Verstappen', acronym: 'VER', team: 'Red Bull Racing', teamColor: '#3671C6', time: '+1.465s' },
    { pos: 3, name: 'Lando Norris', acronym: 'NOR', team: 'McLaren', teamColor: '#FF8000', time: '+7.547s' },
    { pos: 4, name: 'Oscar Piastri', acronym: 'PIA', team: 'McLaren', teamColor: '#FF8000', time: '+12.429s' },
    { pos: 5, name: 'Carlos Sainz', acronym: 'SAI', team: 'Ferrari', teamColor: '#E8002D', time: '+47.318s' },
    { pos: 6, name: 'Nico Hulkenberg', acronym: 'HUL', team: 'Haas F1 Team', teamColor: '#B6B6B6', time: '+52.633s' },
    { pos: 7, name: 'Lance Stroll', acronym: 'STR', team: 'Aston Martin', teamColor: '#229971', time: '+53.639s' },
    { pos: 8, name: 'Fernando Alonso', acronym: 'ALO', team: 'Aston Martin', teamColor: '#229971', time: '+54.390s' },
    { pos: 9, name: 'Alexander Albon', acronym: 'ALB', team: 'Williams', teamColor: '#64C4FF', time: '+56.299s' },
    { pos: 10, name: 'Yuki Tsunoda', acronym: 'TSU', team: 'RB', teamColor: '#6692FF', time: '+1:01.055s' },
    { pos: 11, name: 'Logan Sargeant', acronym: 'SAR', team: 'Williams', teamColor: '#64C4FF', time: '+1:02.820s' },
    { pos: 12, name: 'Kevin Magnussen', acronym: 'MAG', team: 'Haas F1 Team', teamColor: '#B6B6B6', time: '+1:03.618s' },
    { pos: 13, name: 'Daniel Ricciardo', acronym: 'RIC', team: 'RB', teamColor: '#6692FF', time: '+1:09.656s' },
    { pos: 14, name: 'Charles Leclerc', acronym: 'LEC', team: 'Ferrari', teamColor: '#E8002D', time: '+1:15.035s' },
    { pos: 15, name: 'Valtteri Bottas', acronym: 'BOT', team: 'Kick Sauber', teamColor: '#52E252', time: '+1 Lap' },
    { pos: 16, name: 'Esteban Ocon', acronym: 'OCO', team: 'Alpine', teamColor: '#FF87BC', time: '+1 Lap' },
    { pos: 17, name: 'Sergio Perez', acronym: 'PER', team: 'Red Bull Racing', teamColor: '#3671C6', time: 'DNF' },
    { pos: 18, name: 'Zhou Guanyu', acronym: 'ZHO', team: 'Kick Sauber', teamColor: '#52E252', time: 'DNF' },
    { pos: 19, name: 'Pierre Gasly', acronym: 'GAS', team: 'Alpine', teamColor: '#FF87BC', time: 'DNF' },
    { pos: 20, name: 'George Russell', acronym: 'RUS', team: 'Mercedes', teamColor: '#27F4D2', time: 'DNF' }
];

function populateLeaderboard() {
    const container = document.getElementById('leaderboard-list');
    if (!container) return;

    container.innerHTML = SILVERSTONE_2024_RESULTS.map(driver => `
        <div class="leaderboard-item">
            <div class="position ${driver.pos <= 3 ? 'p' + driver.pos : ''}">${driver.pos}</div>
            <div class="driver-info">
                <div class="team-bar" style="background: ${driver.teamColor}"></div>
                <div>
                    <div class="driver-name">${driver.acronym}</div>
                    <div class="driver-team">${driver.team}</div>
                </div>
            </div>
            <div class="driver-time ${driver.pos === 1 ? 'winner' : ''}">${driver.time}</div>
        </div>
    `).join('');
}

document.addEventListener('DOMContentLoaded', init);
