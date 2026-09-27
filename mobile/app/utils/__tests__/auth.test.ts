import {
  BROWSER_SESSION,
  canSubmitPasswordLogin,
  cookieOwnedByPlatform,
  clearToken,
  cookieHeader,
  loadRememberedCode,
  loadToken,
  normaliseCode,
  rememberCode,
  saveToken,
  tokenFromSetCookie,
} from "../auth"

describe("auth utils", () => {
  it("reads the session token out of Set-Cookie", () => {
    expect(tokenFromSetCookie("pms_session=abc123; Path=/; HttpOnly; SameSite=Lax")).toBe("abc123")
    expect(tokenFromSetCookie(["other=1; Path=/", "pms_session=xyz; Max-Age=100"])).toBe("xyz")
    expect(tokenFromSetCookie("other=1; Path=/, pms_session=joined; Path=/")).toBe("joined")
    expect(tokenFromSetCookie("pms_session=; Max-Age=0")).toBeNull()
    expect(tokenFromSetCookie(null)).toBeNull()
  })

  it("builds the Cookie header", () => {
    expect(cookieHeader("t")).toBe("pms_session=t")
    expect(cookieHeader(null)).toBeNull()
    expect(cookieHeader(BROWSER_SESSION)).toBeNull()
  })

  it("knows when the browser keeps the cookie", () => {
    expect(cookieOwnedByPlatform("web")).toBe(true)
    expect(cookieOwnedByPlatform("android")).toBe(false)
    expect(cookieOwnedByPlatform("ios")).toBe(false)
  })

  it("stores and clears the token", () => {
    saveToken("tok")
    expect(loadToken()).toBe("tok")
    clearToken()
    expect(loadToken()).toBeNull()
  })

  it("normalises and remembers property codes", () => {
    expect(normaliseCode("srd-1001 ")).toBe("SRD1001")
    rememberCode("abc 1234")
    expect(loadRememberedCode()).toBe("ABC1234")
  })

  it("enables the login button like the web", () => {
    expect(canSubmitPasswordLogin("", "a@b.c", "x")).toBe(true)
    expect(canSubmitPasswordLogin("SRD1", "a@b.c", "x")).toBe(true)
    expect(canSubmitPasswordLogin("SR", "a@b.c", "x")).toBe(false)
    expect(canSubmitPasswordLogin("SRD1001", "ab.c", "x")).toBe(false)
    expect(canSubmitPasswordLogin("SRD1001", "a@b.c", "")).toBe(false)
  })
})
