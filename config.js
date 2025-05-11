// config.js
const { Regex } = require('@companion-module/base')

const configFields = [
            {
                type: 'textinput',
                id: 'server_ip',
                label: 'Target IP',
                width: 8,
                regex: Regex.IP, // Added IP validation
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

module.exports = configFields; // Added this line to properly export the array
