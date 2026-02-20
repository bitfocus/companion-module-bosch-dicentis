// config.js
const { Regex } = require('@companion-module/base')

const configFields = [
	{
		type: 'dropdown',
		id: 'transport',
		label: 'Transport',
		width: 6,
		default: 'websocket',
		choices: [
			{ id: 'websocket', label: 'DICENTIS API (WebSocket)' },
			{ id: 'rest', label: 'DICENTIS Wireless (REST)' },
		],
	},
	{
		type: 'textinput',
		id: 'server_ip',
		label: 'Target IP',
		width: 8,
		regex: Regex.IP,
	},
	{
		type: 'textinput',
		id: 'rest_port',
		label: 'REST Port',
		width: 4,
		default: '80',
		isVisible: (options) => options.transport === 'rest',
	},
	{
		type: 'dropdown',
		id: 'rest_protocol',
		label: 'REST Protocol',
		width: 4,
		default: 'http',
		isVisible: (options) => options.transport === 'rest',
		choices: [
			{ id: 'http', label: 'HTTP' },
			{ id: 'https', label: 'HTTPS' },
		],
	},
	{
		type: 'textinput',
		id: 'rest_login_path',
		label: 'REST Login Path',
		width: 6,
		default: '/api/login',
		isVisible: (options) => options.transport === 'rest',
	},
	{
		type: 'textinput',
		id: 'rest_command_path',
		label: 'REST Command Path',
		width: 6,
		default: '/api',
		isVisible: (options) => options.transport === 'rest',
	},
	{
		type: 'textinput',
		id: 'username',
		label: 'Username',
		width: 6,
	},
	{
		type: 'textinput',
		id: 'password',
		label: 'Password',
		width: 6,
	},
	{
		type: 'number',
		id: 'pollInterval',
		label: 'Polling Interval (ms)',
		tooltip: 'How often to request updates (e.g., mic status). Lower values are more responsive but increase network traffic.',
		width: 6,
		default: 100,
		min: 50,
		max: 10000,
	},
]

module.exports = configFields
