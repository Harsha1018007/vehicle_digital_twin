/**
 * @file brake_ecu.c
 * @brief Brake ECU firmware logic (Embedded C)
 *
 * Implements brake system control logic including:
 *   - Brake pressure sensor reading
 *   - ABS (Anti-lock Braking System) state machine
 *   - CAN message transmission to vehicle network
 *
 * Target: ARM Cortex-M3/M4
 *
 * @author Niharika Banothu
 * @date 2026
 */

#include "can_frame.h"
#include <string.h>

/* ====================== Static State ====================== */

static brake_payload_t brake_state = {
    .brake_pressure_x10 = 0,
    .abs_status = 0,
    .pedal_position = 0,
    .reserved = {0}
};

/* ABS activation thresholds */
#define ABS_PRESSURE_THRESHOLD_X10  700U   /* 70.0 bar */
#define BRAKE_PRESSURE_MAX_X10      2500U  /* 250.0 bar */

/* ====================== Pack Brake Frame ====================== */

void can_pack_brake(can_frame_t *frame, const brake_payload_t *payload)
{
    if (frame == NULL || payload == NULL) {
        return;
    }

    frame->id  = ECU_ID_BRAKE;
    frame->dlc = CAN_MAX_DLC;

    /* Brake pressure x10 (bytes 0-1, big-endian) */
    frame->data[0] = (uint8_t)((payload->brake_pressure_x10 >> 8) & 0xFF);
    frame->data[1] = (uint8_t)(payload->brake_pressure_x10 & 0xFF);

    /* ABS Status (byte 2) */
    frame->data[2] = payload->abs_status;

    /* Pedal Position (byte 3) */
    frame->data[3] = payload->pedal_position;

    /* Reserved */
    frame->data[4] = 0;
    frame->data[5] = 0;
    frame->data[6] = 0;
    frame->data[7] = 0;
}

/* ====================== ABS State Machine ====================== */

/**
 * @brief Update ABS status based on current brake pressure
 *
 * Simple ABS logic: activate when pressure exceeds threshold.
 * Real ABS uses wheel slip ratio comparison.
 */
static void update_abs_status(void)
{
    if (brake_state.brake_pressure_x10 >= ABS_PRESSURE_THRESHOLD_X10) {
        brake_state.abs_status = 1U;
    } else {
        brake_state.abs_status = 0U;
    }
}

/* ====================== Brake ECU Task ====================== */

void brake_ecu_task(void)
{
    can_frame_t tx_frame;

    /* In real hardware:
     *   brake_state.pedal_position    = read_pedal_sensor();
     *   brake_state.brake_pressure_x10 = read_pressure_transducer();
     */

    /* Update ABS state machine */
    update_abs_status();

    /* Pack and transmit */
    can_pack_brake(&tx_frame, &brake_state);
    (void)can_send(&tx_frame);
}

/* ====================== State Setters ====================== */

void brake_set_pressure(uint16_t pressure_x10)
{
    if (pressure_x10 > BRAKE_PRESSURE_MAX_X10) {
        pressure_x10 = BRAKE_PRESSURE_MAX_X10;
    }
    brake_state.brake_pressure_x10 = pressure_x10;
}

void brake_set_pedal_position(uint8_t percent)
{
    if (percent > 100U) {
        percent = 100U;
    }
    brake_state.pedal_position = percent;
}
