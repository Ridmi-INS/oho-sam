const pino = require('pino');

const logLevel = process.env?.LOG_LEVEL || (['staging', 'test'].includes(process.env.ENV) ? 'trace' : 'info');

module.exports = pino(
  {
    level: logLevel,
    timestamp: pino.stdTimeFunctions.isoTime,
    msgPrefix: '',
    formatters: {
      level(label, number) {
        return { level: label };
      },
    },
    base: {
      pid: process.pid,
      hostname: process.env.AWS_LAMBDA_RUNTIME_API,
      function: process.env.AWS_LAMBDA_FUNCTION_NAME,
      lambda_handler: process.env._HANDLER,
    },
  },
  pino.destination({
    sync: true,
  }),
);
