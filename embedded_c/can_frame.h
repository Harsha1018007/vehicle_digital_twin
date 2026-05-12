/**
 * @file can_frame.h
 * @brief CAN 2.0B Frame definitions for Vehicle Digital Twin
 *
 * Defines the standard CAN frame structure and ECU arbitration IDs
 * used throughout the vehicle network.
 *
 * @author Niharika Banothu
 * @date 2026
 */

#ifndef CAN_FRAME_H
#define CAN_FRAME_H

#include <stdint.h>

/* ====================== CAN Constants ====================== */

#define CAN_MAX_DLC          8       /* Max data length code (bytes) */
#define CAN_STD_ID_MASK      0x7FF   /* 11-bit standard identifier */

/* ====================== ECU Arbitration IDs ====================== */
/* Lower ID = Higher priority on the CAN bus                    */

#define ECU_ID_ENGINE        0x100   /* Engine ECU */
#define ECU_ID_BRAKE         0x200   /* Brake ECU */
#define ECU_ID_SPEED         0x300   /* Speed/Wheel Sensor ECU */
#define ECU_ID_DIAG          0x7DF   /* Diagnostic broadcast */

/* ====================== Standard CAN Frame ====================== */

/**
 * @brief Standard CAN 2.0B frame structure
 */
typedef struct {
    uint16_t id;              /* 11-bit arbitration ID */
    uint8_t  dlc;             /* Data length code (0-8) */
    uint8_t  data[CAN_MAX_DLC]; /* Payload */
    uint32_t timestamp;       /* Timestamp in microseconds */
} can_frame_t;

/* ====================== Engine Payload Layout ====================== */
/**
 * Byte 0-1: RPM           (uint16_t, big-endian)
 * Byte 2-3: CoolantTemp*10 (uint16_t, big-endian, 0.1°C resolution)
 * Byte 4  : Throttle %     (uint8_t)
 * Byte 5-7: Reserved
 */
typedef struct {
    uint16_t rpm;
    uint16_t coolant_temp_x10;
    uint8_t  throttle;
    uint8_t  reserved[3];
} engine_payload_t;

/* ====================== Brake Payload Layout ====================== */
/**
 * Byte 0-1: BrakePressure*10 (uint16_t, big-endian, 0.1 bar resolution)
 * Byte 2  : ABS Status        (uint8_t, 0=Off, 1=On)
 * Byte 3  : Pedal Position %  (uint8_t)
 * Byte 4-7: Reserved
 */
typedef struct {
    uint16_t brake_pressure_x10;
    uint8_t  abs_status;
    uint8_t  pedal_position;
    uint8_t  reserved[4];
} brake_payload_t;

/* ====================== Speed Payload Layout ====================== */
/**
 * Byte 0-1: VehicleSpeed*10 (uint16_t, big-endian)
 * Byte 2-3: WheelFL*10      (uint16_t)
 * Byte 4-5: WheelFR*10      (uint16_t)
 * Byte 6-7: Reserved
 */
typedef struct {
    uint16_t vehicle_speed_x10;
    uint16_t wheel_fl_x10;
    uint16_t wheel_fr_x10;
    uint8_t  reserved[2];
} speed_payload_t;

/* ====================== Function Prototypes ====================== */

/**
 * @brief Pack Engine data into a CAN frame
 */
void can_pack_engine(can_frame_t *frame, const engine_payload_t *payload);

/**
 * @brief Pack Brake data into a CAN frame
 */
void can_pack_brake(can_frame_t *frame, const brake_payload_t *payload);

/**
 * @brief Pack Speed data into a CAN frame
 */
void can_pack_speed(can_frame_t *frame, const speed_payload_t *payload);

/**
 * @brief Send a CAN frame on the bus (platform-specific)
 */
int can_send(const can_frame_t *frame);

#endif /* CAN_FRAME_H */
