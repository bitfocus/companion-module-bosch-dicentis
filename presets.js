const { combineRgb } = require('@companion-module/base')

module.exports = {
    getPresets: function (instance) {
        const presets = {} // Use object for easier management if needed, convert to array at the end

        // Create presets for each seat
        Object.entries(instance.seats || {}).forEach(([varName, seat]) => {
            presets[`mic_${varName}`] = { // Give it a unique ID
                type: 'button',
                category: 'Microphones',
                name: seat.name + '\\n' + seat.screenLine,
                style: {
                    text: seat.name + '\\n' + seat.screenLine,
                    size: 'auto',
                    color: combineRgb(255, 255, 255),
                    bgcolor: combineRgb(0, 0, 0),
                },
                steps: [
                    {
                        down: [
                            {
                                actionId: 'toggle_microphone',
                                options: {
                                    seat: varName,
                                },
                            },
                        ],
                        up: [], // Add empty up array
                    },
                ],
                feedbacks: [
                    {
                        feedbackId: 'mic_state',
                        options: {
                            seat: varName,
                        },
                        style: {
                            bgcolor: combineRgb(255, 0, 0),
                        },
                    },
                ],
            }
        })

        // Create presets for each interpreter seat
        Object.entries(instance.interpreterSeats || {}).forEach(([name, seat]) => {
            presets[`interpreter_${name}`] = { // Give it a unique ID
                type: 'button',
                category: 'Interpreters',
                name: `Booth ${seat.boothNumber}\\nDesk ${seat.deskNumber}`,
                style: {
                    text: `Booth ${seat.boothNumber}\\nDesk ${seat.deskNumber}`,
                    size: 'auto',
                    color: combineRgb(255, 255, 255),
                    bgcolor: combineRgb(0, 0, 0),
                },
                steps: [
                    {
                        down: [
                            {
                                actionId: 'grant_interpretation',
                                options: {
                                    interpreter_seat: name,
                                    state: 'activeOnOutputA', // Example state, adjust if needed
                                },
                            },
                        ],
                        up: [
                            {
                                actionId: 'grant_interpretation',
                                options: {
                                    interpreter_seat: name,
                                    state: 'off',
                                },
                            },
                        ],
                    },
                ],
                feedbacks: [
                    {
                        feedbackId: 'interpreter_state',
                        options: {
                            interpreter_seat: name,
                        },
                        style: {
                            bgcolor: combineRgb(255, 0, 0),
                        },
                    },
                ],
            }
        })

        return Object.values(presets) // Return presets as an array
    },
}
