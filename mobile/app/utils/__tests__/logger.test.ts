import { logDebug, logError, logInfo, logWarn } from "../logger"

describe("logger", () => {
  const log = jest.spyOn(console, "log").mockImplementation(() => undefined)
  const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined)
  const error = jest.spyOn(console, "error").mockImplementation(() => undefined)
  afterAll(() => {
    log.mockRestore()
    warn.mockRestore()
    error.mockRestore()
  })

  it("prefixes every line and routes by level", () => {
    logDebug("d")
    logInfo("i", { a: 1 })
    logWarn("w")
    logError("e", new Error("x"))
    expect(log).toHaveBeenCalledWith("[pms] d", "")
    expect(log).toHaveBeenCalledWith("[pms] i", { a: 1 })
    expect(warn).toHaveBeenCalledWith("[pms] w", "")
    expect(error).toHaveBeenCalledWith("[pms] e", expect.any(Error))
  })
})
