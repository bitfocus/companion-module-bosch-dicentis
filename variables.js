module.exports = {
	updateVariableDefinitions: function (instance) {
		const variables = [
			{ variableId: 'Active_Microphone_ScreenLine', name: 'Active Microphone Screen Line' },
			{ variableId: 'Active_Microphone_SeatName', name: 'Active Microphone Seat Name' },
			// Add other static variables here if needed in the future
		]

		const variableValues = {
			Active_Microphone_ScreenLine: '',
			Active_Microphone_SeatName: '',
		}

		// Add dynamic seat variables
		Object.entries(instance.seats || {}).forEach(([varName, seat]) => {
			variables.push({
				variableId: varName,
				name: `Seat: ${seat.name || varName}`, // Use seat name if available
			})
			// Initialize seat variables if needed, though their values might be set elsewhere
			// variableValues[varName] = seat.seatId; // Example if needed here
		})

		// Add dynamic interpreter seat variables
		Object.entries(instance.interpreterSeats || {}).forEach(([name, seat]) => {
			variables.push({
				variableId: name,
				name: `Interpreter: Booth ${seat.boothNumber} Desk ${seat.deskNumber}`,
			})
			// variableValues[name] = seat.seatId; // Example if needed here
		})

		instance.setVariableDefinitions(variables)

		// Set initial static values only - dynamic ones will be updated by specific events/polling
		instance.setVariableValues({
			Active_Microphone_ScreenLine: variableValues.Active_Microphone_ScreenLine,
			Active_Microphone_SeatName: variableValues.Active_Microphone_SeatName,
		})

		// Note: Dynamic variable values (like specific seat names/IDs) should be updated
		// within the functions that process the relevant data (e.g., processSeats, processInterpreterSeats)
		// using instance.setVariableValues({ ... }).
	},

	updateSpecificVariableValues: function (instance, values) {
		instance.setVariableValues(values)
	}
}