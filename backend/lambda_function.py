"""
AWS Lambda function for F1 Telemetry Dashboard (Silverstone 2024).
Fetches data from OpenF1 API without external dependencies.
"""

import json
import urllib.request
import urllib.parse
import math
import time
from typing import Any

# OpenF1 API Base URL
OPENF1_BASE = "https://api.openf1.org/v1"

# Silverstone 2024 Session Key
SESSION_KEY = 9558
RACE_NAME = "British GP 2024"
RACE_LOCATION = "Silverstone"

# Top 10 Drivers (Silverstone 2024)
TOP_10_DRIVERS = [44, 1, 4, 81, 55, 27, 18, 14, 23, 22]

# Team Colors
TEAM_COLORS = {
    "Mercedes": "#27F4D2",
    "Red Bull Racing": "#3671C6",
    "Ferrari": "#E8002D",
    "McLaren": "#FF8000",
    "Alpine": "#FF87BC",
    "RB": "#6692FF",
    "Aston Martin": "#229971",
    "Williams": "#64C4FF",
    "Kick Sauber": "#52E252",
    "Haas F1 Team": "#B6B6B6"
}

# Tire Colors
TIRE_COLORS = {
    "SOFT": "#DC2626",
    "MEDIUM": "#F59E0B",
    "HARD": "#4B5563",
    "INTERMEDIATE": "#059669",
    "WET": "#2563EB"
}


def fetch_json(url: str) -> list[dict[str, Any]]:
    """Fetch JSON from URL using standard library."""
    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            data = response.read().decode('utf-8')
            return json.loads(data)
    except Exception as e:
        print(f"API Hatası: {e}")
        return []


def calculate_z_score(values: list[float]) -> tuple[float, float]:
    """Calculate mean and standard deviation."""
    if not values:
        return 0.0, 1.0
    
    n = len(values)
    mean = sum(values) / n
    
    if n < 2:
        return mean, 1.0
    
    variance = sum((x - mean) ** 2 for x in values) / (n - 1)
    std_dev = math.sqrt(variance) if variance > 0 else 1.0
    
    return mean, std_dev


def get_summary_data() -> dict[str, Any]:
    """Summary: Get lap times, tire data, and anomalies for top 10 drivers."""
    result = {
        "session_key": SESSION_KEY,
        "event": RACE_NAME,
        "location": RACE_LOCATION,
        "drivers": []
    }
    
    # Fetch data for each driver
    for i, driver_number in enumerate(TOP_10_DRIVERS):
        if i > 0:
            time.sleep(0.5)  # Rate limit prevention
        
        driver_url = f"{OPENF1_BASE}/drivers?session_key={SESSION_KEY}&driver_number={driver_number}"
        driver_data = fetch_json(driver_url)
        
        if not driver_data:
            continue
        
        driver_info = driver_data[0]
        
        laps_url = f"{OPENF1_BASE}/laps?session_key={SESSION_KEY}&driver_number={driver_number}"
        laps_data = fetch_json(laps_url)
        
        stints_url = f"{OPENF1_BASE}/stints?session_key={SESSION_KEY}&driver_number={driver_number}"
        stints_data = fetch_json(stints_url)
        
        tire_map = {}
        for stint in stints_data:
            compound = stint.get("compound", "UNKNOWN")
            lap_start = stint.get("lap_start", 1)
            lap_end = stint.get("lap_end", 999)
            for lap_num in range(lap_start, lap_end + 1):
                tire_map[lap_num] = compound
        
        laps = []
        lap_times = []
        
        for lap in laps_data:
            lap_number = lap.get("lap_number")
            lap_duration = lap.get("lap_duration")
            
            if lap_duration and lap_duration > 0:
                lap_times.append(lap_duration)
                laps.append({
                    "lap_number": lap_number,
                    "lap_duration": round(lap_duration, 3),
                    "compound": tire_map.get(lap_number, "UNKNOWN"),
                    "is_anomaly": False
                })
        
        # Z-Score Anomaly Detection
        if lap_times:
            mean, std_dev = calculate_z_score(lap_times)
            
            for lap in laps:
                z_score = (lap["lap_duration"] - mean) / std_dev if std_dev > 0 else 0
                lap["z_score"] = round(z_score, 2)
                lap["is_anomaly"] = abs(z_score) > 2.5
        
        result["drivers"].append({
            "driver_number": driver_number,
            "name_acronym": driver_info.get("name_acronym", "UNK"),
            "full_name": driver_info.get("full_name", "Unknown"),
            "team_name": driver_info.get("team_name", "Unknown"),
            "team_color": TEAM_COLORS.get(driver_info.get("team_name", ""), "#888888"),
            "laps": laps,
            "stats": {
                "total_laps": len(laps),
                "mean_lap_time": round(mean, 3) if lap_times else 0,
                "std_dev": round(std_dev, 3) if lap_times else 0,
                "fastest_lap": round(min(lap_times), 3) if lap_times else 0,
                "slowest_lap": round(max(lap_times), 3) if lap_times else 0
            }
        })
    
    return result


def get_telemetry_data(driver_number: int, lap_number: int) -> dict[str, Any]:
    """Telemetry: Get speed/rpm/gear data for a specific lap."""
    result = {
        "driver_number": driver_number,
        "lap_number": lap_number,
        "telemetry": []
    }
    
    lap_url = f"{OPENF1_BASE}/laps?session_key={SESSION_KEY}&driver_number={driver_number}&lap_number={lap_number}"
    lap_data = fetch_json(lap_url)
    
    if not lap_data:
        result["error"] = "Lap data not found"
        return result
    
    lap_info = lap_data[0]
    date_start = lap_info.get("date_start")
    lap_duration = lap_info.get("lap_duration", 120) 
    
    if not date_start:
        result["error"] = "Lap start time not found"
        return result
    
    # Car data (OpenF1 date stats)
    car_url = f"{OPENF1_BASE}/car_data?session_key={SESSION_KEY}&driver_number={driver_number}&date>={date_start}"
    car_data = fetch_json(car_url)
    
    if not car_data:
        result["error"] = "Car telemetry data not found"
        return result
    
    # Decimation: Take every 3rd point to reduce payload
    decimation_factor = 3
    telemetry_points = []
    
    max_points = int(lap_duration * 5)
    
    for i, point in enumerate(car_data[:max_points]):
        if i % decimation_factor == 0:
            telemetry_points.append({
                "date": point.get("date", ""),
                "speed": point.get("speed", 0),
                "rpm": point.get("rpm", 0),
                "gear": point.get("n_gear", 0),
                "throttle": point.get("throttle", 0),
                "brake": point.get("brake", 0),
                "drs": point.get("drs", 0)
            })
    
    result["telemetry"] = telemetry_points
    result["total_points"] = len(telemetry_points)
    
    return result


def lambda_handler(event: dict, context: Any) -> dict[str, Any]:
    """AWS Lambda Handler."""
    # CORS headers
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Content-Type": "application/json"
    }
    
    # OPTIONS request (CORS preflight)
    http_method = event.get("httpMethod", event.get("requestContext", {}).get("http", {}).get("method", "GET"))
    if http_method == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": headers,
            "body": ""
        }
    
    # Query parameters
    params = event.get("queryStringParameters") or {}
    request_type = params.get("type", "summary")
    
    try:
        if request_type == "summary":

            data = get_summary_data()
        
        elif request_type == "telemetry":

            driver_number = int(params.get("driver_number", 44))
            lap_number = int(params.get("lap_number", 1))
            data = get_telemetry_data(driver_number, lap_number)
        
        else:
            data = {"error": f"Unknown type: {request_type}"}
        
        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps(data, ensure_ascii=False)
        }
    
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": str(e)})
        }



