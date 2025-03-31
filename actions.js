module.exports = {
	getActions: function (instance) {
		const choices = instance.getSeatChoices()
		const interpreterChoices = instance.getInterpreterSeatChoices()

		return {
			custom_command: {
				name: 'Custom Command',
				options: [
					{
						type: 'textinput',
						label: 'Operation',
						id: 'operation',
						default: '',
					},
					{
						type: 'textinput',
						label: 'Parameters (JSON)',
						id: 'parameters',
						default: '{}',
					},
				],
				callback: async (action) => {
					try {
						const parameters = JSON.parse(action.options.parameters)
						const message = {
							operation: action.options.operation,
							parameters: parameters,
						}
						if (instance.ws && instance.ws.readyState === WebSocket.OPEN) {
							instance.ws.send(JSON.stringify(message))
						} else {
							instance.log('error', '[CUSTOM] WebSocket not connected')
						}
					} catch (error) {
						instance.log('error', `[CUSTOM] Error parsing parameters JSON: ${error.message}`)
					}
				},
			},
			toggle_microphone: {
				name: 'Toggle Microphone',
				options: [
					{
						type: 'dropdown',
						label: 'Seat',
						id: 'seat',
						default: choices[0]?.id || '',
						choices: choices,
					},
				],
				callback: async (action) => {
					instance.toggleMicrophone(action.options.seat)
				},
			},
			activate_microphone: {
				name: 'Activate Microphone',
				options: [
					{
						type: 'dropdown',
						label: 'Seat',
						id: 'seat',
						default: choices[0]?.id || '',
						choices,
					},
				],
				callback: async (action) => {
					instance.activateMicrophone(instance.seats[action.options.seat]?.seatId)
				},
			},
			deactivate_microphone: {
				name: 'Deactivate Microphone',
				options: [
					{
						type: 'dropdown',
						label: 'Seat',
						id: 'seat',
						default: choices[0]?.id || '',
						choices,
					},
				],
				callback: async (action) => {
					instance.deactivateMicrophone(instance.seats[action.options.seat]?.seatId)
				},
			},
			grant_interpretation: {
				name: 'Grant Interpretation',
				options: [
					{
						type: 'dropdown',
						label: 'Interpreter Seat',
						id: 'interpreter_seat',
						default: interpreterChoices[0]?.id || '',
						choices: interpreterChoices,
					},
					{
						type: 'dropdown',
						label: 'State',
						id: 'state',
						default: 'off',
						choices: [
							{ id: 'off', label: 'Off' },
							{ id: 'activeOnOutputA', label: 'Active on Output A' },
							{ id: 'activeOnOutputB', label: 'Active on Output B' },
							{ id: 'activeOnOutputC', label: 'Active on Output C' },
						],
					},
				],
				callback: async (action) => {
					instance.grantInterpretation(instance.interpreterSeats[action.options.interpreter_seat]?.seatId, action.options.state)
				},
			},
		}
	},
}