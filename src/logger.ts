import { AsyncLocalStorage } from 'async_hooks'
import winston from 'winston'

export const requestContext = new AsyncLocalStorage<{ reqId: string }>()

function withReqId(meta: Record<string, unknown>): Record<string, unknown> {
  const ctx = requestContext.getStore()
  return ctx ? { ...meta, reqId: ctx.reqId } : meta
}

const logger = winston.createLogger({
  level: 'info',
  format:
    process.env.NODE_ENV === 'production'
      ? winston.format.combine(
          winston.format.timestamp(),
          winston.format.printf(({ level, message, timestamp, ...meta }) =>
            JSON.stringify({ level, message, timestamp, ...withReqId(meta) }),
          ),
        )
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp({ format: 'HH:mm:ss' }),
          winston.format.printf(({ level, message, timestamp, ...meta }) => {
            const merged = withReqId(meta)
            const extras = Object.keys(merged).length ? ' ' + JSON.stringify(merged) : ''
            return `${timestamp} ${level}: ${message}${extras}`
          }),
        ),
  transports: [new winston.transports.Console()],
})

export default logger
