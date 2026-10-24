// script.js

const $ = (id) => document.getElementById(id);

let moistureChart = null;
let historyLabels = [];
let soil1History = [];
let soil2History = [];
let commandInProgress = false;

// ================= CONNECTION STATUS =================
function setConnection(online) {
    $("connectionText").textContent = online
        ? "ESP32 connected"
        : "ESP32 offline";

    $("sidebarConnection").textContent = online
        ? "Device Online"
        : "Device Offline";

    $("connectionDot").className =
        "status-dot " + (online ? "online" : "offline");

    $("sidebarDot").className =
        "status-dot " + (online ? "online" : "offline");
}

// ================= MOISTURE ===========================
function moistureLabel(value) {
    if (value < 35) return "Dry soil";
    if (value < 80) return "Moderate moisture";
    return "Wet soil";
}

function updateMoisture(sensor, value, raw) {
    const percentage = Math.max(
        0,
        Math.min(100, Number(value) || 0)
    );

    $(`${sensor}Value`).textContent = percentage;
    $(`${sensor}Raw`).textContent = raw ?? "--";
    $(`${sensor}Bar`).style.width = `${percentage}%`;
    $(`${sensor}Label`).textContent = moistureLabel(percentage);
    $(`${sensor}Detail`).textContent = `${percentage}%`;
    $(`${sensor}Condition`).textContent = moistureLabel(percentage);

    const bar = $(`${sensor}Bar`);

    bar.style.background =
        percentage < 35 ? "var(--yellow)" :
        percentage >= 80 ? "var(--blue)" :
        "var(--green)";
}

// ================= MODE ===============================
function updateMode(mode) {
    const isAuto = mode === "AUTO";

    $("modeBadge").textContent =
        isAuto ? "AUTO MODE" : "MANUAL MODE";

    $("currentMode").textContent = mode;

    $("autoModeBtn").classList.toggle("auto-button", isAuto);
    $("manualModeBtn").classList.toggle("auto-button", !isAuto);

    // Pump buttons stay clickable in both modes.
    $("pumpOnBtn").disabled = false;
    $("pumpOffBtn").disabled = false;

    $("controlDescription").textContent = isAuto
        ? "Automatic watering is controlled by the ESP32. Pump buttons switch to manual mode."
        : "Use the pump buttons to control irrigation manually.";
}

// ================= PUMP DISPLAY =======================
function updatePump(isOn) {
    $("pumpValue").textContent = isOn ? "ON" : "OFF";

    $("controlPumpStatus").textContent =
        isOn ? "Pump ON" : "Pump OFF";

    $("pumpDescription").textContent =
        isOn ? "Water pump is running" : "Pump is stopped";

    $("pumpBadge").textContent = isOn ? "RUNNING" : "STANDBY";

    $("pumpBadge").className = isOn
        ? "pill"
        : "pill neutral";

    $("pumpValue").style.color =
        isOn ? "var(--green)" : "var(--muted)";
}

// ================= RAIN ===============================
function updateRain(raining) {
    $("rainStatus").textContent =
        raining ? "Rain detected" : "No rain";

    $("rainDescription").textContent = raining
        ? "Irrigation is stopped for rain."
        : "No rain detected by the sensor.";

    $("rainIcon").textContent = raining ? "🌧️" : "☀️";
}

// ================= CHART HISTORY ======================
function addHistory(data) {
    const now = new Date();

    const label = now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });

    historyLabels.push(label);
    soil1History.push(Number(data.soil1_moisture));
    soil2History.push(Number(data.soil2_moisture));

    if (historyLabels.length > 20) {
        historyLabels.shift();
        soil1History.shift();
        soil2History.shift();
    }

    if (moistureChart) {
        moistureChart.data.labels = historyLabels;
        moistureChart.data.datasets[0].data = soil1History;
        moistureChart.data.datasets[1].data = soil2History;
        moistureChart.update("none");
    }
}

// ================= INITIALIZE CHART ===================
function initializeChart() {
    const canvas = $("moistureChart");

    if (!canvas || typeof Chart === "undefined") {
        if (canvas) {
            canvas.parentElement.innerHTML =
                "<p class='empty-state'>Chart library unavailable. Check your internet connection.</p>";
        }
        return;
    }

    moistureChart = new Chart(canvas, {
        type: "line",
        data: {
            labels: historyLabels,
            datasets: [
                {
                    label: "Soil Sensor 1 (%)",
                    data: soil1History,
                    borderColor: "#37d49a",
                    backgroundColor: "#37d49a22",
                    borderWidth: 2,
                    pointRadius: 2,
                    tension: 0.3
                },
                {
                    label: "Soil Sensor 2 (%)",
                    data: soil2History,
                    borderColor: "#65a8ff",
                    backgroundColor: "#65a8ff22",
                    borderWidth: 2,
                    pointRadius: 2,
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
                y: {
                    min: 0,
                    max: 100,
                    ticks: { color: "#91a2b9" },
                    grid: { color: "#26364c" }
                },
                x: {
                    ticks: {
                        color: "#91a2b9",
                        maxTicksLimit: 6
                    },
                    grid: { color: "#26364c" }
                }
            },
            plugins: {
                legend: {
                    labels: { color: "#eef4fc" }
                }
            }
        }
    });
}

// ================= ALERTS =============================
function renderAlerts(data) {
    const alerts = [];

    if (!data.device_online) {
        alerts.push({
            type: "error",
            title: "ESP32 offline",
            message: "Check the ESP32 Wi-Fi connection and Flask server."
        });
    }

    if (data.rain_detected) {
        alerts.push({
            type: "warning",
            title: "Rain detected",
            message: "The pump should remain OFF while rain is detected."
        });
    }

    if (
        Number(data.soil1_moisture) < 35 ||
        Number(data.soil2_moisture) < 35
    ) {
        alerts.push({
            type: "warning",
            title: "Dry soil detected",
            message: "At least one soil sensor is below the 35% threshold."
        });
    }

    if (data.flow_fault) {
        alerts.push({
            type: "error",
            title: "Water-flow fault",
            message: "The ESP32 detected no water flow and stopped the pump."
        });
    }

    if (data.runtime_fault) {
        alerts.push({
            type: "error",
            title: "Maximum runtime exceeded",
            message: "The pump was stopped by the runtime safety limit. Inspect the system before restarting."
        });
    }

    if (alerts.length === 0) {
        alerts.push({
            type: "",
            title: "System operating normally",
            message: "No active warnings reported by the available readings."
        });
    }

    $("alertsList").innerHTML = alerts.map((alert) => `
        <div class="alert-item ${alert.type}">
            <div>
                <strong>${alert.title}</strong>
                <p>${alert.message}</p>
            </div>
        </div>
    `).join("");
}

// ================= FETCH SENSOR DATA ==================
async function fetchSensorData() {
    try {
        const response = await fetch("/api/sensors", {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(
                `Sensor request failed: HTTP ${response.status}`
            );
        }

        const data = await response.json();

        setConnection(Boolean(data.device_online));

        updateMoisture(
            "soil1",
            data.soil1_moisture,
            data.soil1_raw
        );

        updateMoisture(
            "soil2",
            data.soil2_moisture,
            data.soil2_raw
        );

        $("waterValue").textContent =
            Number(data.water_liters || 0).toFixed(2);

        $("flowPulses").textContent =
            Number(data.flow_pulses || 0);

        $("rainRaw").textContent = data.rain_raw ?? "--";

        $("deviceStatus").textContent =
            data.device_online ? "Online" : "Offline";

        updateRain(Boolean(data.rain_detected));
        updatePump(Boolean(data.pump_status));

        updateMode(
            data.mode ||
            (data.automatic_mode ? "AUTO" : "MANUAL")
        );

        if (data.last_update) {
            $("lastUpdate").textContent =
                new Date(data.last_update).toLocaleTimeString();
        } else {
            $("lastUpdate").textContent = "Waiting for data";
        }

        addHistory(data);
        renderAlerts(data);

    } catch (error) {
        console.error("Sensor data error:", error);

        setConnection(false);
        $("deviceStatus").textContent = "Offline";
        $("lastUpdate").textContent = "No connection";

        $("alertsList").innerHTML = `
            <div class="alert-item error">
                <div>
                    <strong>Dashboard connection error</strong>
                    <p>Make sure Flask is running and refresh this page.</p>
                </div>
            </div>
        `;
    }
}

// ================= SEND PUMP COMMAND =================
async function sendControl(mode, pump) {
    if (commandInProgress) return;
    commandInProgress = true;

    const buttons = [
        $("autoModeBtn"),
        $("manualModeBtn"),
        $("pumpOnBtn"),
        $("pumpOffBtn")
    ];

    buttons.forEach((button) => {
        if (button) button.disabled = true;
    });

    $("controlMessage").textContent = "Sending command to Flask...";

    try {
        const response = await fetch("/api/control", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                mode: mode,
                pump: pump
            })
        });

        const responseText = await response.text();
        let result;

        try {
            result = JSON.parse(responseText);
        } catch {
            throw new Error(
                `Invalid server response (HTTP ${response.status}).`
            );
        }

        if (!response.ok || result.status !== "success") {
            throw new Error(
                result.error ||
                result.message ||
                `HTTP ${response.status}`
            );
        }

        if (!result.control) {
            throw new Error("No control state returned by Flask.");
        }

        updateMode(result.control.mode);

        $("controlMessage").textContent =
            `Command accepted: ${result.control.mode}, pump ${
                Number(result.control.pump) === 1 ? "ON" : "OFF"
            }. Waiting for ESP32 to apply it...`;

        // Read sensors without pretending that the command itself
        // proves the physical pump has changed state.
        await fetchSensorData();

    } catch (error) {
        console.error("Pump control error:", error);
        $("controlMessage").textContent =
            "Command failed: " + error.message;

    } finally {
        commandInProgress = false;

        buttons.forEach((button) => {
            if (button) button.disabled = false;
        });
    }
}

// ================= BUTTON EVENTS ======================
document.addEventListener("DOMContentLoaded", () => {
    initializeChart();

    $("autoModeBtn").addEventListener("click", () => {
        sendControl("AUTO", 0);
    });

    $("manualModeBtn").addEventListener("click", () => {
        sendControl("MANUAL", 0);
    });

    $("pumpOnBtn").addEventListener("click", () => {
        sendControl("MANUAL", 1);
    });

    $("pumpOffBtn").addEventListener("click", () => {
        sendControl("MANUAL", 0);
    });

    fetchSensorData();

    // Refresh live sensor readings every two seconds.
    setInterval(fetchSensorData, 2000);
});