import mysql.connector
from mysql.connector import Error


# ==========================================
# SMART IRRIGATION - DATABASE CONFIGURATION
# ==========================================

DB_HOST = "localhost"
DB_USER = "root"
DB_PASSWORD = "110905"
DB_NAME = "smart_irrigation_db"


# ==========================================
# CONNECT TO MYSQL
# ==========================================

def get_connection():
    try:
        connection = mysql.connector.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME
        )
        return connection

    except Error as error:
        print("MySQL connection error:", error)
        return None


# ==========================================
# CREATE DATABASE
# ==========================================

def create_database():
    connection = None
    cursor = None

    try:
        connection = mysql.connector.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASSWORD
        )

        cursor = connection.cursor()
        cursor.execute(
            f"CREATE DATABASE IF NOT EXISTS `{DB_NAME}`"
        )

        print("Database ready:", DB_NAME)

    except Error as error:
        print("Database creation error:", error)

    finally:
        if cursor is not None:
            cursor.close()
        if connection is not None and connection.is_connected():
            connection.close()


# ==========================================
# CREATE SENSOR READINGS TABLE
# ==========================================

def create_tables():
    connection = get_connection()

    if connection is None:
        return False

    cursor = None

    try:
        cursor = connection.cursor()

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sensor_readings (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                soil1_raw INT NOT NULL,
                soil2_raw INT NOT NULL,
                soil1_moisture DECIMAL(5,2) NOT NULL,
                soil2_moisture DECIMAL(5,2) NOT NULL,
                rain_raw INT NOT NULL,
                rain_detected BOOLEAN NOT NULL,
                flow_pulses BIGINT NOT NULL,
                water_liters DECIMAL(12,3) NOT NULL,
                pump_status BOOLEAN NOT NULL,
                flow_fault BOOLEAN NOT NULL DEFAULT FALSE,
                runtime_fault BOOLEAN NOT NULL DEFAULT FALSE,
                recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS pump_logs (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                pump_status BOOLEAN NOT NULL,
                operating_mode VARCHAR(10) NOT NULL,
                reason VARCHAR(255),
                recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        print("Database tables ready.")
        return True

    except Error as error:
        print("Table creation error:", error)
        return False

    finally:
        if cursor is not None:
            cursor.close()
        connection.close()


# ==========================================
# SAVE SENSOR READING
# ==========================================

def save_sensor_reading(data):
    connection = get_connection()

    if connection is None:
        return False

    cursor = None

    query = """
        INSERT INTO sensor_readings (
            soil1_raw,
            soil2_raw,
            soil1_moisture,
            soil2_moisture,
            rain_raw,
            rain_detected,
            flow_pulses,
            water_liters,
            pump_status,
            flow_fault,
            runtime_fault
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """

    values = (
        data["soil1_raw"],
        data["soil2_raw"],
        data["soil1_moisture"],
        data["soil2_moisture"],
        data["rain_raw"],
        data["rain_detected"],
        data["flow_pulses"],
        data["water_liters"],
        data["pump_status"],
        data["flow_fault"],
        data["runtime_fault"]
    )

    try:
        cursor = connection.cursor()
        cursor.execute(query, values)
        connection.commit()
        return True

    except Error as error:
        connection.rollback()
        print("Sensor save error:", error)
        return False

    finally:
        if cursor is not None:
            cursor.close()
        connection.close()


# ==========================================
# GET LATEST SENSOR READING
# ==========================================

def get_latest_reading():
    connection = get_connection()

    if connection is None:
        return None

    cursor = None

    try:
        cursor = connection.cursor(dictionary=True)

        cursor.execute("""
            SELECT *
            FROM sensor_readings
            ORDER BY id DESC
            LIMIT 1
        """)

        return cursor.fetchone()

    except Error as error:
        print("Latest reading error:", error)
        return None

    finally:
        if cursor is not None:
            cursor.close()
        connection.close()


# ==========================================
# GET SENSOR HISTORY
# ==========================================

def get_sensor_history(limit=100):
    connection = get_connection()

    if connection is None:
        return []

    cursor = None

    try:
        limit = max(1, min(int(limit), 1000))

        cursor = connection.cursor(dictionary=True)

        cursor.execute("""
            SELECT *
            FROM sensor_readings
            ORDER BY id DESC
            LIMIT %s
        """, (limit,))

        return cursor.fetchall()

    except (Error, ValueError) as error:
        print("Sensor history error:", error)
        return []

    finally:
        if cursor is not None:
            cursor.close()
        connection.close()


# ==========================================
# SAVE PUMP ACTIVITY
# ==========================================

def save_pump_log(pump_status, operating_mode, reason=""):
    if operating_mode not in ("AUTO", "MANUAL"):
        raise ValueError("Invalid operating mode")

    connection = get_connection()

    if connection is None:
        return False

    cursor = None

    try:
        cursor = connection.cursor()

        cursor.execute("""
            INSERT INTO pump_logs (
                pump_status,
                operating_mode,
                reason
            )
            VALUES (%s, %s, %s)
        """, (pump_status, operating_mode, reason))

        connection.commit()
        return True

    except Error as error:
        connection.rollback()
        print("Pump log error:", error)
        return False

    finally:
        if cursor is not None:
            cursor.close()
        connection.close()


# ==========================================
# INITIALIZE DATABASE
# ==========================================

def initialize_database():
    create_database()
    return create_tables()


if __name__ == "__main__":
    if initialize_database():
        print("Smart Irrigation database initialized successfully.")
    else:
        print("Database initialization failed. Check MySQL settings.")