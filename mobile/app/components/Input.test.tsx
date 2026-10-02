import { render } from "@testing-library/react-native"

import { Input } from "./Input"
import { ThemeProvider } from "../theme/context"

const renderInput = (props: Parameters<typeof Input>[0]) =>
  render(
    <ThemeProvider>
      <Input {...props} />
    </ThemeProvider>,
  )

describe("Input", () => {
  it("never auto-capitalises or autocorrects a secret", () => {
    const { getByTestId } = renderInput({ secureTextEntry: true, testID: "pw" })
    const field = getByTestId("pw")
    expect(field.props.autoCapitalize).toBe("none")
    expect(field.props.autoCorrect).toBe(false)
    expect(field.props.spellCheck).toBe(false)
  })

  it("leaves ordinary fields to the caller", () => {
    const { getByTestId } = renderInput({ autoCapitalize: "words", testID: "name" })
    expect(getByTestId("name").props.autoCapitalize).toBe("words")
  })
})
