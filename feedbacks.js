const { combineRgb } = require('@companion-module/base')

module.exports = {
	getFeedbacks: function (instance) {
		return {
			mic_state: {
				type: 'boolean',
				name: 'Microphone State',
				description: 'Change button color based on microphone state',
				defaultStyle: {
					bgcolor: combineRgb(255, 0, 0),
				},
				options: [
					{
						type: 'dropdown',
						label: 'Seat',
						id: 'seat',
						default: '',
						choices: instance.getSeatChoices(),
					},
				],
				callback: (feedback) => {
					const seatId = instance.seats[feedback.options.seat]?.seatId
					if (!seatId) {
						return false
					}
					return instance.isMicrophoneActive(seatId)
				},
				// subscribe/unsubscribe are typically handled by checkFeedbacks internally if polling or websocket updates trigger it
			},
			interpreter_state: {
				type: 'boolean',
				name: 'Interpreter State',
				description: 'Change button color based on interpreter state',
				defaultStyle: {
					bgcolor: combineRgb(255, 0, 0),
				},
				options: [
					{
						type: 'dropdown',
						label: 'Interpreter Seat',
						id: 'interpreter_seat',
						default: '',
						choices: instance.getInterpreterSeatChoices(),
					},
				],
				callback: (feedback) => {
					const seatId = instance.interpreterSeats[feedback.options.interpreter_seat]?.seatId
					if (!seatId) {
						return false
					}
					return instance.isInterpreterActive(seatId)
				},
				// subscribe/unsubscribe are typically handled by checkFeedbacks internally if polling or websocket updates trigger it
			},
		}
	},
}