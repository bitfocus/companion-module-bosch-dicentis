const { InstanceBase, InstanceStatus, runEntrypoint } = require('@companion-module/base')
const WebSocket = require('ws')
const { getActions } = require('./actions')
const { getFeedbacks } = require('./feedbacks')
const { updateVariableDefinitions, updateSpecificVariableValues } = require('./variables')
const { getPresets } = require('./presets')
const configFields = require('./config')

class BoschDicentisInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
		
		this.isInitialized = false
		this.isLoggedIn = false
		this.seats = {}
		this.interpreterSeats = {}
		this.interpreterBooths = new Map()
		this.activeMics = []
		this.previouslyActiveMics = []
		this.currentLatestActiveSpeakerSeatId = null
		this.activeInterpreterStates = new Map()
		this.ws = null
		this.reconnectTimer = null
		this.pollTimer = null

		this.lastServerIp = null
		this.lastUsername = null
		this.lastPassword = null

		this.discussionList = []
		this.isConnecting = false
		this.restSessionCookie = null
		this.restSid = null
	}

	// Helper function to sanitize variable names
	sanitizeVariableName(name) {
		return name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '_')
	}

	init(config) {
		this.log('info', '[MODULE] Loaded build with Latest_Active_Speaker_SeatId support')
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
		this.lastServerIp = config.server_ip
		this.lastUsername = config.username
		this.lastPassword = config.password
		this.updateStatus(InstanceStatus.Ok)

		// Initialize empty structures first with just basic variables
		this.initBaseStructures()

		if (this.isRestMode()) {
			this.initActions()
			this.initFeedbacks()
			this.initPresets()
			this.log('info', `[REST] Using wireless REST API at ${this.getRestBaseUrl()}/api`)
			this.login()
			return
		}

		// Connect to device (WebSocket mode)
		this.initWebSocket()
	}

	isRestMode() {
		return this.config?.transport === 'rest'
	}

	getRestBaseUrl() {
		const protocol = this.config?.rest_protocol || 'http'
		const host = this.config?.server_ip || ''
		const port = this.config?.rest_port || '80'
		return `${protocol}://${host}:${port}`
	}

	getRestPath(configValue, fallbackPath, configFieldName) {
		const configured = typeof configValue === 'string' && configValue.trim() ? configValue.trim() : fallbackPath
		const normalized = configured.startsWith('/') ? configured : `/${configured}`
		const username = (this.config?.username || '').trim().toLowerCase()
		const normalizedLower = normalized.toLowerCase()

		// Guard against config migration issues where username ends up in REST path fields.
		if (username && normalizedLower === `/${username}`) {
			this.log(
				'warn',
				`[REST] Ignoring invalid ${configFieldName} value "${normalized}". Falling back to "${fallbackPath}".`
			)
			return fallbackPath
		}
		if (normalizedLower === '/admin') {
			this.log(
				'warn',
				`[REST] Ignoring invalid ${configFieldName} value "${normalized}". Falling back to "${fallbackPath}".`
			)
			return fallbackPath
		}

		return normalized
	}

	buildRestHeaders(includeJson = true) {
		const headers = {}
		if (includeJson) {
			headers['Content-Type'] = 'application/json'
		}

		if (this.restSessionCookie) {
			headers.Cookie = this.restSessionCookie
		}
		if (this.restSid) {
			headers.sid = this.restSid
		}

		return headers
	}

	async sendRestRequest(method, path, body) {
		let normalizedPath = path.startsWith('/') ? path : `/${path}`
		if (normalizedPath.toLowerCase() === '/admin' || normalizedPath.toLowerCase().startsWith('/admin/')) {
			this.log('warn', `[REST] Invalid path "${normalizedPath}" detected. Rewriting to "/api/login".`)
			normalizedPath = '/api/login'
		}
		const url = `${this.getRestBaseUrl()}${normalizedPath}`

		const requestOptions = {
			method,
			headers: this.buildRestHeaders(body !== undefined),
		}

		if (body !== undefined) {
			requestOptions.body = JSON.stringify(body)
		}

		try {
			const response = await fetch(url, requestOptions)
			const setCookie = response.headers.get('set-cookie')
			if (setCookie) {
				this.restSessionCookie = setCookie.split(';')[0]
				const sidMatch = /sid=([^;]+)/i.exec(setCookie)
				if (sidMatch?.[1]) {
					this.restSid = sidMatch[1]
				}
			}

			const rawResponse = await response.text()
			let parsedResponse = null
			if (rawResponse) {
				try {
					parsedResponse = JSON.parse(rawResponse)
				} catch (error) {
					parsedResponse = rawResponse
				}
			}

			if (!response.ok) {
				this.log('error', `[REST] ${method} ${normalizedPath} failed with ${response.status}: ${rawResponse}`)
				return null
			}

			return parsedResponse
		} catch (error) {
			this.log('error', `[REST] ${method} ${normalizedPath} request failed: ${error.message}`)
			return null
		}
	}

	sendApiMessage(operation, parameters = {}) {
		if (this.isRestMode()) {
			this.log('warn', `[REST] Operation-style command "${operation}" is not supported in wireless REST mode`)
			return false
		}

		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify({ operation, parameters }))
			return true
		}

		this.log('error', `[API] Connection not ready for operation: ${operation}`)
		return false
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
		if (!this.isRestMode()) {
			setTimeout(() => this.sendInterpretationRoutingsRequest(), 50)
		}

		// Set up continuous polling
		const discussionListTimer = setInterval(() => this.sendDiscussionListRequest(), pollInterval)
		const interpretationRoutingsTimer = this.isRestMode()
			? null
			: setInterval(() => this.sendInterpretationRoutingsRequest(), pollInterval)

		// Store timers for cleanup
		this.pollTimer = {
			discussionList: discussionListTimer,
			interpretationRoutings: interpretationRoutingsTimer
		}
	}

	sendDiscussionListRequest() {
		if (this.isRestMode()) {
			void this.sendRestRequest('GET', '/api/speakers').then((response) => {
				if (!Array.isArray(response)) {
					return
				}

				this.processDiscussionList({
					parameters: {
						discussionList: response.map((entry) => ({
							seatId: entry.id,
							screenLine: entry.name || '',
							microphoneState: entry.micOn ? 'on' : 'off',
						})),
					},
				})
			})
			return
		}

		this.sendApiMessage('GetDiscussionList', {})
	}

	sendInterpretationRoutingsRequest() {
		if (this.isRestMode()) {
			return
		}
		this.sendApiMessage('GetInterpretationRoutings', {})
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

	stopWebSocketConnection() {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer)
			this.reconnectTimer = null
		}

		if (this.ws) {
			this.ws.removeAllListeners()
			this.ws.close()
			this.ws = null
		}

		this.isConnecting = false
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
				if (error.message && error.message.includes('ECONNREFUSED')) {
					this.log('warn', '[WEBSOCKET] Connection refused. If this is a DCNM-WAP wireless unit, set Transport to "DICENTIS Wireless (REST)".')
				}
			})

		} catch (error) {
			this.log('error', `[WEBSOCKET] Failed to initialize: ${error.message}`)
			this.isConnecting = false
		}
	}

	getPermissions() {
		this.sendApiMessage('GetPermissions', {})
	}

	getSeats() {
		if (this.isRestMode()) {
			void this.sendRestRequest('GET', '/api/seats').then((response) => {
				if (!Array.isArray(response)) {
					return
				}

				this.processSeats({
					parameters: {
						seats: response.map((seat) => ({
							seatId: seat.id,
							seatName: seat.name || `Seat ${seat.id}`,
							screenLine: seat.name || '',
						})),
					},
				})
			})
			return
		}
		this.sendApiMessage('getseats', {})
	}

	getInterpreterBooths() {
		if (this.isRestMode()) {
			return
		}
		this.sendApiMessage('GetInterpreterBooths', {})
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
		if (!this.isRestMode() && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
			this.log('error', '[INTERPRETER] WebSocket not connected')
			return
		}

		this.sendApiMessage('GetInterpretationRoutings', {})
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
		if (!this.isRestMode() && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
			this.log('error', '[INTERPRETER] WebSocket not connected')
			return
		}

		this.sendApiMessage('GetInterpreterSeats', {})
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
		if (this.isRestMode()) {
			this.log('warn', '[REST] Interpreter controls are not available in DCNM-WAP REST API')
			return
		}

		if (!this.isRestMode() && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
			this.log('error', '[INTERPRETER] WebSocket not connected')
			return
		}

		this.sendApiMessage('GrantInterpretation', {
			seatId: seatId,
			microphoneState: state,
		})
	}

	login() {
		if (this.isRestMode()) {
			// Wireless API spec defines a fixed login endpoint under /api.
			const loginPath = '/api/login'
			this.restSessionCookie = null
			this.restSid = null
			this.log('debug', `[REST] Login request path: ${loginPath}`)
			void this.sendRestRequest('POST', loginPath, {
				username: this.config.username || '',
				password: this.config.password || '',
				override: true,
			}).then((response) => {
				if (response !== null) {
					this.isLoggedIn = true
					this.updateStatus(InstanceStatus.Ok, 'REST connected')
					this.getSeats()
					this.startPolling()
				}
			})
			return
		}

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
		if (!this.isRestMode() && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
			this.log('error', '[SPEECH] WebSocket not connected')
			return
		}

		if (this.isRestMode()) {
			void this.sendRestRequest('POST', '/api/speakers', [seatId])
			return
		}
		this.sendApiMessage('grantSpeech', {
			seatIds: [seatId],
			participantIds: [],
		})
	}

	toggleMicrophone(varName) {
		const seat = this.seats[varName]
		if (!seat) {
			this.log('error', `[MIC] No seat found for variable name: ${varName}`)
			return
		}

		if (this.activeMics.includes(seat.seatId)) {
			this.deactivateMicrophone(seat.seatId)
		} else {
			this.activateMicrophone(seat.seatId)
		}
	}

	activateMicrophone(seatId) {
		if (!seatId) {
			return
		}

		if (!this.isRestMode() && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
			this.log('error', '[MIC] WebSocket not connected')
			return
		}

		if (this.isRestMode()) {
			void this.sendRestRequest('POST', '/api/speakers', [seatId])
			return
		}

		this.sendApiMessage('grantspeech', {
			seatIds: [seatId],
		})
	}

	deactivateMicrophone(seatId) {
		if (!seatId) {
			return
		}

		if (!this.isRestMode() && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
			this.log('error', '[MIC] WebSocket not connected')
			return
		}

		if (this.isRestMode()) {
			void this.sendRestRequest('DELETE', `/api/speakers/${seatId}`)
			return
		}

		this.sendApiMessage('removespeech', {
			seatIds: [seatId],
		})
	}

	processDiscussionList(response) {
		if (!response.parameters?.discussionList) {
			return
		}

		const discussionList = response.parameters.discussionList

		// Store previous active mics to help determine the latest
		this.previouslyActiveMics = [...this.activeMics]

		// Get current active mic seat IDs from the discussion list
		const currentActiveMicSeatIds = []
		discussionList.forEach((participant) => {
			if (participant.microphoneState === 'on') {
				currentActiveMicSeatIds.push(participant.seatId)
			}
		})
		this.activeMics = currentActiveMicSeatIds

		// Determine the latest active speaker
		let newLatestSpeakerFoundThisCycle = false
		// Check for any newly activated speaker
		for (const seatId of this.activeMics) {
			if (!this.previouslyActiveMics.includes(seatId)) {
				this.currentLatestActiveSpeakerSeatId = seatId
				newLatestSpeakerFoundThisCycle = true
				break // Found the newest, take the first one as per Dicentis list order
			}
		}

		// If no new speaker was found in this cycle,
		// check if the existing latest speaker is still active.
		if (!newLatestSpeakerFoundThisCycle) {
			if (this.currentLatestActiveSpeakerSeatId) { // If we had a latest speaker
				// And that speaker is no longer active
				if (!this.activeMics.includes(this.currentLatestActiveSpeakerSeatId)) {
					// The old latest is gone, pick a new one if any mics are active
					if (this.activeMics.length > 0) {
						// Fallback: if the previous latest is off, pick the first from current active list
						this.currentLatestActiveSpeakerSeatId = this.activeMics[0]
					} else {
						// No mics active at all
						this.currentLatestActiveSpeakerSeatId = null
					}
				}
				// Else: current latest is still active and no new one appeared, so it remains the latest.
			} else {
				// We didn't have a latest speaker previously (e.g. startup, or all were off)
				if (this.activeMics.length > 0) {
					// If mics are now active, pick the first one
					this.currentLatestActiveSpeakerSeatId = this.activeMics[0]
				}
				// Else: still no mics active, this.currentLatestActiveSpeakerSeatId remains null.
			}
		}

		const variableValuesToUpdate = {}

		// Update variables for 1st, 2nd, 3rd active speakers
		for (let i = 0; i < 3; i++) {
			const seatId = this.activeMics[i]
			let screenLine = ''
			let seatName = ''

			if (seatId) {
				const activeSeat = Object.values(this.seats).find(s => s.seatId === seatId)
				if (activeSeat) {
					const activeParticipant = discussionList.find(p => p.seatId === seatId)
					screenLine = activeParticipant?.screenLine || ''
					seatName = activeSeat.name || ''
				}
			}
			variableValuesToUpdate[`${i + 1}st_Active_Speaker_ScreenLine`] = screenLine
			variableValuesToUpdate[`${i + 1}st_Active_Speaker_SeatName`] = seatName
		}

		// Update variables for the latest active speaker
		let latestScreenLine = ''
		let latestSeatName = ''
		let latestSeatId = ''
		if (this.currentLatestActiveSpeakerSeatId) {
			latestSeatId = String(this.currentLatestActiveSpeakerSeatId)
			const latestActiveSeat = Object.values(this.seats).find(s => s.seatId === this.currentLatestActiveSpeakerSeatId)
			if (latestActiveSeat) {
				const latestParticipant = discussionList.find(p => p.seatId === this.currentLatestActiveSpeakerSeatId)
				latestScreenLine = latestParticipant?.screenLine || ''
				latestSeatName = latestActiveSeat.name || ''
			}
		}
		variableValuesToUpdate['Latest_Active_Speaker_ScreenLine'] = latestScreenLine
		variableValuesToUpdate['Latest_Active_Speaker_SeatName'] = latestSeatName
		variableValuesToUpdate['Latest_Active_Speaker_SeatId'] = latestSeatId
		const latestSpeakerNumberMatch = latestSeatName.match(/\d+/)
		variableValuesToUpdate['Latest_Active_Speaker_Number'] = latestSpeakerNumberMatch ? latestSpeakerNumberMatch[0] : latestSeatId

		// Update the old single active speaker variables for backward compatibility (optional, can be removed)
		// For now, let's point them to the 1st active speaker
		variableValuesToUpdate['Active_Microphone_ScreenLine'] = variableValuesToUpdate['1st_Active_Speaker_ScreenLine'] || ''
		variableValuesToUpdate['Active_Microphone_SeatName'] = variableValuesToUpdate['1st_Active_Speaker_SeatName'] || ''

		updateSpecificVariableValues(this, variableValuesToUpdate)

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
		return this.activeMics.includes(seatId)
	}

	isInterpreterActive(seatId) {
		const state = this.activeInterpreterStates.get(seatId)
		return state && state !== 'off'
	}

	getConfigFields() {
		return configFields
	}

	async configUpdated(config) {
		const previousServerIp = this.lastServerIp
		const previousUsername = this.lastUsername
		const previousPassword = this.lastPassword
		const previousTransport = this.config?.transport || 'websocket'

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

		// Handle transport changes explicitly
		if (previousTransport !== (config.transport || 'websocket')) {
			this.stopPolling()

			if (config.transport === 'rest') {
				this.stopWebSocketConnection()
				this.restSessionCookie = null
				this.restSid = null
				this.initActions()
				this.initFeedbacks()
				this.initPresets()
				this.login()
			} else {
				this.restSessionCookie = null
				this.restSid = null
				this.initWebSocket()
			}
		}

		// If we're already connected and the server details changed, reconnect (WebSocket mode)
		if (!this.isRestMode() && this.isInitialized && 
			(previousServerIp !== config.server_ip || 
			previousUsername !== config.username || 
			previousPassword !== config.password)) {
			
			// Close existing connection if any
			this.stopWebSocketConnection()

			// Reinitialize connection
			this.initWebSocket()
		}

		if (this.isRestMode()) {
			this.login()
		}

		this.lastServerIp = config.server_ip
		this.lastUsername = config.username
		this.lastPassword = config.password

		this.updateStatus(InstanceStatus.Ok)
	}
}

runEntrypoint(BoschDicentisInstance, [])
