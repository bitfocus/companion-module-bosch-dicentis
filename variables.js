module.exports = {
	updateVariableDefinitions: function (instance) {
		const variables = [
			{ variableId: 'Active_Microphone_ScreenLine', name: 'Active Microphone Screen Line' },
			{ variableId: 'Active_Microphone_SeatName', name: 'Active Microphone Seat Name' },
			// Add other static variables here if needed in the future
			{ variableId: '1st_Active_Speaker_ScreenLine', name: '1st Active Speaker Screen Line' },
			{ variableId: '1st_Active_Speaker_SeatName', name: '1st Active Speaker Seat Name' },
			{ variableId: '2nd_Active_Speaker_ScreenLine', name: '2nd Active Speaker Screen Line' },
			{ variableId: '2nd_Active_Speaker_SeatName', name: '2nd Active Speaker Seat Name' },
			{ variableId: '3rd_Active_Speaker_ScreenLine', name: '3rd Active Speaker Screen Line' },
			{ variableId: '3rd_Active_Speaker_SeatName', name: '3rd Active Speaker Seat Name' },
			{ variableId: 'Latest_Active_Speaker_ScreenLine', name: 'Latest Active Speaker Screen Line' },
			{ variableId: 'Latest_Active_Speaker_SeatName', name: 'Latest Active Speaker Seat Name' },
		]

		const variableValues = {
			Active_Microphone_ScreenLine: '',
			Active_Microphone_SeatName: '',
			'1st_Active_Speaker_ScreenLine': '',
			'1st_Active_Speaker_SeatName': '',
			'2nd_Active_Speaker_ScreenLine': '',
			'2nd_Active_Speaker_SeatName': '',
			'3rd_Active_Speaker_ScreenLine': '',
			'3rd_Active_Speaker_SeatName': '',
			'Latest_Active_Speaker_ScreenLine': '',
			'Latest_Active_Speaker_SeatName': '',
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
			'1st_Active_Speaker_ScreenLine': variableValues['1st_Active_Speaker_ScreenLine'],
			'1st_Active_Speaker_SeatName': variableValues['1st_Active_Speaker_SeatName'],
			'2nd_Active_Speaker_ScreenLine': variableValues['2nd_Active_Speaker_ScreenLine'],
			'2nd_Active_Speaker_SeatName': variableValues['2nd_Active_Speaker_SeatName'],
			'3rd_Active_Speaker_ScreenLine': variableValues['3rd_Active_Speaker_ScreenLine'],
			'3rd_Active_Speaker_SeatName': variableValues['3rd_Active_Speaker_SeatName'],
			'Latest_Active_Speaker_ScreenLine': variableValues['Latest_Active_Speaker_ScreenLine'],
			'Latest_Active_Speaker_SeatName': variableValues['Latest_Active_Speaker_SeatName'],
		})

		// Note: Dynamic variable values (like specific seat names/IDs) should be updated
		// within the functions that process the relevant data (e.g., processSeats, processInterpreterSeats)
		// using instance.setVariableValues({ ... }).
	},

	updateSpecificVariableValues: function (instance, values) {
		instance.setVariableValues(values)
	}
}