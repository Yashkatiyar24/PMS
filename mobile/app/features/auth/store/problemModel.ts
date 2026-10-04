import { types } from "mobx-state-tree"

import type { ApiProblem } from "@/services/api"

/** An API problem kept in a store so a screen can show it. */
export const ProblemModel = types.model("Problem", {
  kind: types.string,
  status: types.maybeNull(types.number),
  message: types.string,
  code: types.maybe(types.string),
  fields: types.maybe(types.frozen<Record<string, string>>()),
  temporary: types.boolean,
})

export function toProblem(problem: ApiProblem) {
  return ProblemModel.create({
    kind: problem.kind,
    status: problem.status,
    message: problem.message,
    code: problem.code,
    fields: problem.fields,
    temporary: problem.temporary,
  })
}
