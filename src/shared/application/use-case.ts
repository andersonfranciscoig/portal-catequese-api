/** Caso de uso: uma ação da aplicação, com uma entrada e uma saída. */
export interface UseCase<Input, Output> {
  execute(input: Input): Promise<Output>;
}
