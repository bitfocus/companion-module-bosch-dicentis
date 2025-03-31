const { InstanceBase, InstanceStatus, runEntrypoint, combineRgb } = require('@companion-module/base')
const WebSocket = require('ws')
const { getActions } = require('./actions')
const { getFeedbacks } = require('./feedbacks')
const { updateVariableDefinitions, updateSpecificVariableValues } = require('./variables')
const { getPresets } = require('./presets')

class BoschDicentisInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
		
		this.isInitialized = false
		this.isLoggedIn = false
		this.seats = {}
		this.interpreterSeats = {}
		this.interpreterBooths = new Map()
		this.activeMics = new Set()
		this.activeInterpreterStates = new Map()
		this.ws = null
		this.reconnectTimer = null
		this.pollTimer = null

		this.lastServerIp = null
		this.lastUsername = null
		this.lastPassword = null

		this.discussionList = []
		this.isConnecting = false
	}

	// Helper function to sanitize variable names
	sanitizeVariableName(name) {
		return name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '_')
	}

	init(config) {
		// Validate config
		if (!config.server_ip) {
			this.log('error', '[CONFIG] Server IP is required')
			this.updateStatus(InstanceStatus.BadConfig, 'Server IP is required')
			return
		}
		
		if (!config.username) {
			this.log('error', '[CONFIG] Username is required')
			this.updateStatus(InstanceStatus.BadConfig, 'Username is required')
			return
		}
		
		this.config = config
		this.isInitialized = true
		this.updateStatus(InstanceStatus.Ok)

		// Initialize empty structures first with just basic variables
		this.initBaseStructures()
		
		// Connect to device
		this.initWebSocket()
	}

	initBaseStructures() {

		// Initialize empty actions
		this.setActionDefinitions({})

		// Initialize empty feedbacks
		this.setFeedbackDefinitions({})

		// Initialize empty presets
		this.setPresetDefinitions([])

		updateVariableDefinitions(this)
	}

	initFeedbacks() {
		this.setFeedbackDefinitions(getFeedbacks(this))
	}

	initActions() {
		this.setActionDefinitions(getActions(this))
	}

	getSeatChoices() {
		const choices = Object.entries(this.seats).map(([varName, seat]) => ({
			id: varName,
			label: varName
		}))
		return choices
	}

	getInterpreterSeatChoices() {
		const choices = Object.entries(this.interpreterSeats).map(([name, seat]) => ({
			id: name,
			label: name
		}))
		return choices
	}

	initPresets() {
		this.setPresetDefinitions(getPresets(this))
	}

	startPolling() {
		// Clear any existing polling
		this.stopPolling()

		const pollInterval = this.config.pollInterval || 100

		// Send initial requests
		this.sendDiscussionListRequest()
		setTimeout(() => this.sendInterpretationRoutingsRequest(), 50)

		// Set up continuous polling
		const discussionListTimer = setInterval(() => this.sendDiscussionListRequest(), pollInterval)
		const interpretationRoutingsTimer = setInterval(() => this.sendInterpretationRoutingsRequest(), pollInterval)

		// Store timers for cleanup
		this.pollTimer = {
			discussionList: discussionListTimer,
			interpretationRoutings: interpretationRoutingsTimer
		}
	}

	sendDiscussionListRequest() {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			const message = {
				operation: 'GetDiscussionList',
				parameters: {}
			}
			this.ws.send(JSON.stringify(message))
		}
	}

	sendInterpretationRoutingsRequest() {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			const message = {
				operation: 'GetInterpretationRoutings',
				parameters: {}
			}
			this.ws.send(JSON.stringify(message))
		}
	}

	stopPolling() {
		if (this.pollTimer) {
			if (this.pollTimer.discussionList) {
				clearInterval(this.pollTimer.discussionList)
			}
			if (this.pollTimer.interpretationRoutings) {
				clearInterval(this.pollTimer.interpretationRoutings)
			}
			this.pollTimer = null
		}
	}

	initWebSocket() {
		if (this.isConnecting) {
			return
		}

		this.isConnecting = true
		const wsUrl = `wss://${this.config.server_ip}:31416/Dicentis/API`

		try {
			if (this.ws) {
				this.ws.removeAllListeners()
				this.ws.close()
			}

			this.ws = new WebSocket(wsUrl, 'DICENTIS_1_0', {
				rejectUnauthorized: false,
				requestCert: false,
				agent: false
			})

			this.ws.on('open', () => {
				this.isConnecting = false
				if (this.reconnectTimer) {
					clearTimeout(this.reconnectTimer)
					this.reconnectTimer = null
				}
				
				// Add a small delay before login to ensure connection is fully established
				setTimeout(() => {
					this.login()
				}, 1000)
			})

			this.ws.on('message', (data) => {
				this.messageReceivedFromWebSocket(data)
			})

			this.ws.on('close', (code, reason) => {
				this.isConnecting = false
				this.isLoggedIn = false
				
				// Clear polling timer
				if (this.pollTimer) {
					clearInterval(this.pollTimer.discussionList)
					clearInterval(this.pollTimer.interpretationRoutings)
					this.pollTimer = null
				}
				
				// Schedule reconnect if not already scheduled
				if (!this.reconnectTimer) {
					this.reconnectTimer = setTimeout(() => {
						this.reconnectTimer = null
						this.initWebSocket()
					}, 5000)
				}
			})

			this.ws.on('error', (error) => {
				this.log('error', `[WEBSOCKET] Error: ${error.message}`)
			})

		} catch (error) {
			this.log('error', `[WEBSOCKET] Failed to initialize: ${error.message}`)
			this.isConnecting = false
		}
	}

	getPermissions() {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			const message = {
				operation: 'GetPermissions',
				parameters: {}
			}
			this.ws.send(JSON.stringify(message))
		} else {
			this.log('error', '[PERMISSIONS] WebSocket not connected')
		}
	}

	getSeats() {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			const message = {
				operation: 'getseats',
				parameters: {}
			}
			this.ws.send(JSON.stringify(message))
		} else {
			this.log('error', '[SEATS] WebSocket not connected')
		}
	}

	getInterpreterBooths() {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			const message = {
				operation: 'GetInterpreterBooths',
				parameters: {}
			}
			this.ws.send(JSON.stringify(message))
		} else {
			this.log('error', '[INTERPRETER] WebSocket not connected')
		}
	}

	messageReceivedFromWebSocket(data) {
		try {
			const msgValue = JSON.parse(data)
			
			// Only log non-polling messages
			if (!['GetDiscussionList', 'GetInterpretationRoutings'].includes(msgValue.operation)) {
				this.log('debug', `[WEBSOCKET] Message received: ${JSON.stringify(msgValue)}`)
			}

			switch (msgValue.operation) {
				case 'GetDiscussionList':
					this.processDiscussionList(msgValue)
					break
				case 'getseats':
					this.processSeats(msgValue)
					break
				case 'login':
					this.handleLoginResponse(msgValue)
					break
				case 'GetPermissions':
					this.log('info', `[PERMISSIONS] Server Response: ${JSON.stringify(msgValue)}`)
					break
				case 'GetInterpreterBooths':
					this.processInterpreterBooths(msgValue)
					break
				case 'GetInterpreterSeats':
					this.processInterpreterSeats(msgValue)
					break
				case 'GetInterpretationRoutings':
					this.processInterpretationRoutings(msgValue)
					break
				case 'error':
					this.log('error', `[WEBSOCKET] Error from server: ${msgValue.parameters?.message || 'Unknown error'}`)
					break
				default:
					this.log('info', `[CUSTOM] Server Response: ${JSON.stringify(msgValue)}`)
			}
		} catch (error) {
			this.log('error', `[WEBSOCKET] Error processing message: ${error.message}`)
		}
	}

	handleLoginResponse(response) {
		if (response.parameters?.loggedIn === true) {
			this.isLoggedIn = true
			this.updateStatus(InstanceStatus.Ok)

			// Request initial data
			this.getPermissions()
			this.getSeats()
			this.getInterpreterBooths()

			// Start polling after login
			this.startPolling()
		} else {
			this.isLoggedIn = false
			this.updateStatus(InstanceStatus.ConnectionFailure, 'Login failed')
		}
	}

	requestInterpretationRoutings() {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			this.log('error', '[INTERPRETER] WebSocket not connected')
			return
		}

		const message = {
			operation: 'GetInterpretationRoutings',
			parameters: {}
		}
		this.ws.send(JSON.stringify(message))
	}

	processInterpreterBooths(response) {
		if (!response.parameters?.booths) {
			return
		}

		const booths = response.parameters.booths
		this.interpreterBooths.clear()

		booths.forEach(booth => {
			if (booth.boothId && booth.boothNumber !== undefined) {
				this.interpreterBooths.set(booth.boothId, booth.boothNumber)
			}
		})

		// Now that we have booth numbers, request seats
		this.getInterpreterSeats()
	}

	getInterpreterSeats() {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			this.log('error', '[INTERPRETER] WebSocket not connected')
			return
		}

		const message = {
			operation: 'GetInterpreterSeats',
			parameters: {}
		}
		this.ws.send(JSON.stringify(message))
	}

	processInterpreterSeats(response) {
		if (!response.parameters?.seats) {
			return
		}

		const seats = response.parameters.seats
		this.interpreterSeats = {}

		seats.forEach(seat => {
			if (!seat.seatId || !seat.deskNumber || !seat.boothId) {
				return
			}

			const boothNumber = this.interpreterBooths.get(seat.boothId)
			if (boothNumber === undefined) {
				return
			}

			// Create variable name from booth number and desk number
			const varName = `${boothNumber}_${seat.deskNumber}`
			
			this.interpreterSeats[varName] = {
				seatId: seat.seatId,
				boothId: seat.boothId,
				boothNumber: boothNumber,
				deskNumber: seat.deskNumber,
				name: varName
			}
		})

// Update definitions and re-initialize dependent components
updateVariableDefinitions(this);
this.initActions(); // Re-init actions to update choices
this.initFeedbacks(); // Re-init feedbacks to update choices
this.initPresets(); // Re-init presets to update choices
	}

	processInterpretationRoutings(response) {
		if (!response.parameters?.routings) {
			return
		}

		const routings = response.parameters.routings
		const newStates = new Map()

		routings.forEach(routing => {
			if (routing.seatId && routing.microphoneState) {
				newStates.set(routing.seatId, routing.microphoneState)
			}
		})

		// Update states and trigger feedback updates if changed
		if (!this.areMapsEqual(this.activeInterpreterStates, newStates)) {
			this.activeInterpreterStates = newStates
			this.checkFeedbacks('interpreter_state')
		}
	}

	// Helper function to compare Maps
	areMapsEqual(a, b) {
		if (a.size !== b.size) return false
		for (const [key, value] of a) {
			if (!b.has(key) || b.get(key) !== value) return false
		}
		return true
	}

	grantInterpretation(seatId, state) {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			this.log('error', '[INTERPRETER] WebSocket not connected')
			return
		}

		const message = {
			operation: 'GrantInterpretation',
			parameters: {
				seatId: seatId,
				microphoneState: state
			}
		}
		this.ws.send(JSON.stringify(message))
	}

	login() {
		const authPayload = {
			operation: 'login',
			parameters: {
				user: this.config.username || '',
				password: this.config.password || ''
			}
		}

		try {
			this.ws.send(JSON.stringify(authPayload))
		} catch (error) {
			this.log('error', `[LOGIN] Failed to send login request: ${error.message}`)
		}
	}


	processSeats(response) {
		if (!response.parameters?.seats) {
			return
		}

		const seats = response.parameters.seats
		
		// Sort seats by their numbers
		seats.sort((a, b) => {
			const aMatch = a.seatName.match(/\d+/)
			const bMatch = b.seatName.match(/\d+/)
			
			// If both have numbers, compare numerically
			if (aMatch && bMatch) {
				const aNum = parseInt(aMatch[0])
				const bNum = parseInt(bMatch[0])
				return aNum - bNum
			}
			
			// If only one has a number, put numbered ones first
			if (aMatch) return -1
			if (bMatch) return 1
			
			// Otherwise sort alphabetically
			return a.seatName.localeCompare(b.seatName)
		})

		this.seats = {}

		seats.forEach(seat => {
			if (!seat.seatId || !seat.seatName || !seat.screenLine) {
				return
			}

			// Sanitize both seatName and screenLine
			const sanitizedSeatName = this.sanitizeVariableName(seat.seatName)
			const sanitizedScreenLine = this.sanitizeVariableName(seat.screenLine)
			const varName = `${sanitizedSeatName}_${sanitizedScreenLine}`
			
			this.seats[varName] = {
				seatId: seat.seatId,
				name: seat.seatName,
				screenLine: seat.screenLine
			}
		})

// Update definitions and re-initialize dependent components
updateVariableDefinitions(this);
this.initActions(); // Re-init actions to update choices
this.initFeedbacks(); // Re-init feedbacks to update choices
this.initPresets(); // Re-init presets to update choices
	}

	grantSpeech(seatId) {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			this.log('error', '[SPEECH] WebSocket not connected')
			return
		}

		const message = {
			operation: 'grantSpeech',
			parameters: {
				seatIds: [seatId],
				participantIds: []
			}
		}
		this.ws.send(JSON.stringify(message))
	}

	toggleMicrophone(varName) {
		const seat = this.seats[varName]
		if (!seat) {
			this.log('error', `[MIC] No seat found for variable name: ${varName}`)
			return
		}

		if (this.activeMics.has(seat.seatId)) {
			this.deactivateMicrophone(seat.seatId)
		} else {
			this.activateMicrophone(seat.seatId)
		}
	}

	activateMicrophone(seatId) {
		if (!seatId) {
			return
		}

		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			this.log('error', '[MIC] WebSocket not connected')
			return
		}

		const message = {
			operation: 'grantspeech',
			parameters: {
				seatIds: [seatId]
			}
		}
		this.ws.send(JSON.stringify(message))
	}

	deactivateMicrophone(seatId) {
		if (!seatId) {
			return
		}

		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			this.log('error', '[MIC] WebSocket not connected')
			return
		}

		const message = {
			operation: 'removespeech',
			parameters: {
				seatIds: [seatId]
			}
		}
		this.ws.send(JSON.stringify(message))
	}

	processDiscussionList(response) {
		if (!response.parameters?.discussionList) {
			return
		}

		const discussionList = response.parameters.discussionList
		// Update the active mic tracking
		this.activeMics.clear()
		discussionList.forEach((participant) => {
			if (participant.microphoneState === 'on') {
				this.activeMics.add(participant.seatId)
			}
		})
		
		// Update the variables with the screenLine and seatName of the active speaker
		let activeScreenLine = '';
		let activeSeatName = '';
		if (this.activeMics.size > 0) {
			const firstActiveSeatId = this.activeMics.values().next().value;
			// Find the seat info from our stored seats using the seatId
			const activeSeat = Object.values(this.seats).find(seat => seat.seatId === firstActiveSeatId);
			if (activeSeat) {
				// Use screenLine from discussion list (more accurate) but name from seats list
				const activeParticipant = discussionList.find(p => p.seatId === firstActiveSeatId);
				activeScreenLine = activeParticipant?.screenLine || '';
				activeSeatName = activeSeat.name || '';
			}
		}
		
		// Update the specific variables using the imported function
		updateSpecificVariableValues(this, {
			Active_Microphone_ScreenLine: activeScreenLine,
			Active_Microphone_SeatName: activeSeatName
		});
		
		// Check feedbacks after updating state
		this.checkFeedbacks('mic_state')
	}

	// Helper function to compare Sets
	areSetsEqual(a, b) {
		if (a.size !== b.size) return false
		for (const item of a) {
			if (!b.has(item)) return false
		}
		return true
	}

	isMicrophoneActive(seatId) {
		return this.activeMics.has(seatId)
	}

	isInterpreterActive(seatId) {
		const state = this.activeInterpreterStates.get(seatId)
		return state && state !== 'off'
	}

	// Add this static method
	static getConfigFields() {
		return getConfigFields()
	}

	async configUpdated(config) {
		// Store new config
		this.config = config

		// Validate config
		if (!config.server_ip) {
			this.log('error', '[CONFIG] Server IP is required')
			this.updateStatus(InstanceStatus.BadConfig, 'Server IP is required')
			return
		}
		
		if (!config.username) {
			this.log('error', '[CONFIG] Username is required')
			this.updateStatus(InstanceStatus.BadConfig, 'Username is required')
			return
		}

		// If we're already connected and the server details changed, reconnect
		if (this.isInitialized && 
			(this.lastServerIp !== config.server_ip || 
			this.lastUsername !== config.username || 
			this.lastPassword !== config.password)) {
			
			// Close existing connection if any
			if (this.ws) {
				this.ws.close()
			}

			// Reinitialize connection
			this.initWebSocket()
		}

		this.updateStatus(InstanceStatus.Ok)
	}
}

runEntrypoint(BoschDicentisInstance, [])
