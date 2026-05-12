/**
 * @file engine_ecu.c
 * @brief Engine ECU firmware logic (Embedded C)
 *
 * This file represents the embedded C code that would run on a real
 * Engine ECU microcontroller. It demonstrates:
 *   - CAN frame packing using bit manipulation
 *   - Big-endian byte ordering for automotive standards
 *   - Memory-safe data handling on resource-constrained devices
 *
 * Target: ARM Cortex-M3/M4 (e.g., STM32F1)
 *
 * @author Niharika Banothu
 * @date 2026
 */

#include "can_frame.h"
#include <string.h>

/* ====================== Static State ====================== */

static engine_payload_t engine_state = {
    .rpm = 800,            /* Idle RPM */
    .coolant_temp_x10 = 850, /* 85.0 °C */
    .throttle = 20,
    .reserved = {0}
};

/* ====================== CAN Frame Packing ====================== */

/**
 * @brief Pack Engine payload into CAN frame (Big-Endian)
 *
 * Big-endian is the automotive standard for CAN signals to ensure
 * cross-platform compatibility between OEMs and ECUs.
 *
 * @param frame   Output CAN frame
 * @param payload Input engine data
 */
void can_pack_engine(can_frame_t *frame, const engine_payload_t *payload)
{
    if (frame == NULL || payload == NULL) {
        return;
    }

    /* Set frame metadata */
    frame->id  = ECU_ID_ENGINE;
    frame->dlc = CAN_MAX_DLC;

    /* Pack RPM (bytes 0-1, big-endian) */
    frame->data[0] = (uint8_t)((payload->rpm >> 8) & 0xFF);
    frame->data[1] = (uint8_t)(payload->rpm & 0xFF);

    /* Pack Coolant Temp x10 (bytes 2-3, big-endian) */
    frame->data[2] = (uint8_t)((payload->coolant_temp_x10 >> 8) & 0xFF);
    frame->data[3] = (uint8_t)(payload->coolant_temp_x10 & 0xFF);

    /* Pack Throttle (byte 4) */
    frame->data[4] = payload->throttle;

    /* Reserved bytes */
    frame->data[5] = 0;
    frame->data[6] = 0;
    frame->data[7] = 0;
}

/* ====================== ECU Task Function ====================== */

/**
 * @brief Engine ECU periodic task (called every 100ms from RTOS scheduler)
 *
 * In a real ECU, this would be triggered by:
 *   - A timer interrupt (e.g., TIM2 on STM32)
 *   - An RTOS task (e.g., FreeRTOS xTaskCreate)
 *
 * This function reads sensors, updates state, and transmits a CAN frame.
 */
void engine_ecu_task(void)
{
    can_frame_t tx_frame;

    /* In real hardware, replace with actual sensor reads:
     *   engine_state.rpm = read_crankshaft_sensor();
     *   engine_state.coolant_temp_x10 = read_temp_sensor();
     *   engine_state.throttle = read_throttle_pot();
     */

    /* Pack data into CAN frame */
    can_pack_engine(&tx_frame, &engine_state);

    /* Transmit on CAN bus */
    (void)can_send(&tx_frame);
}

/* ====================== State Update API ====================== */

/**
 * @brief Update internal engine state (called from sensor ISRs)
 */
void engine_set_rpm(uint16_t rpm)
{
    /* Clamp to valid range */
    if (rpm > 10000U) {
        rpm = 10000U;
    }
    engine_state.rpm = rpm;
}

void engine_set_coolant_temp(int16_t temp_celsius)
{
    /* Convert to 0.1°C resolution, clamp to uint16 range */
    int32_t scaled = (int32_t)temp_celsius * 10;
    if (scaled < 0) {
        scaled = 0;
    } else if (scaled > 0xFFFF) {
        scaled = 0xFFFF;
    }
    engine_state.coolant_temp_x10 = (uint16_t)scaled;
}

void engine_set_throttle(uint8_t percent)
{
    if (percent > 100U) {
        percent = 100U;
    }
    engine_state.throttle = percent;
}
