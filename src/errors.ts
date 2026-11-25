/**
 * Thrown when a tool call cannot be served as asked: an unknown place, dates outside
 * the forecast, hours that cannot fit. The message is sent back to the model, so
 * write it as an instruction on how to fix the call.
 */
export class WeatherInputError extends Error {}
