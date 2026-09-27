import { PageHeader, Screen, Text } from "@/components"
import type { ScreenComponent } from "@/navigators/navigationTypes"

/** A stand-in while a module is being built; removed as each real screen lands. */
export function placeholderScreen(title: string): ScreenComponent {
  return function Placeholder() {
    return (
      <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={{ padding: 16 }}>
        <PageHeader title={title} />
        <Text text="Coming next." />
      </Screen>
    )
  }
}
