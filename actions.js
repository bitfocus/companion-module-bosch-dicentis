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
						instance.sendApiMessage(action.options.operation, parameters)
					} catch (error) {
						instance.log('error', `[CUSTOM] Error parsing parameters JSON: ${error.message}`)
					}
				},
			},
			rest_request: {
				name: 'REST Request',
				options: [
					{
						type: 'dropdown',
						label: 'Method',
						id: 'method',
						default: 'GET',
						choices: [
							{ id: 'GET', label: 'GET' },
							{ id: 'POST', label: 'POST' },
							{ id: 'PUT', label: 'PUT' },
							{ id: 'DELETE', label: 'DELETE' },
						],
					},
					{
						type: 'textinput',
						label: 'Path',
						id: 'path',
						default: '/api',
					},
					{
						type: 'textinput',
						label: 'Body (JSON, optional)',
						id: 'body',
						default: '',
					},
				],
				callback: async (action) => {
					if (!instance.isRestMode()) {
						instance.log('warn', '[REST] REST Request action is only used when transport is set to REST')
						return
					}

					let body = undefined
					if (action.options.body && action.options.body.trim() !== '') {
						try {
							body = JSON.parse(action.options.body)
						} catch (error) {
							instance.log('error', `[REST] Invalid JSON body: ${error.message}`)
							return
						}
					}

					await instance.sendRestRequest(action.options.method, action.options.path, body)
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