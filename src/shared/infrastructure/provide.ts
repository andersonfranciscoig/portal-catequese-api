import type { FactoryProvider, InjectionToken } from "@nestjs/common";

type Constructor<T> = abstract new (...args: never[]) => T;

/**
 * Regista uma classe sem decorators do Nest (casos de uso, serviços de aplicação)
 * indicando as dependências pela ordem do construtor. Assim o domínio e a
 * aplicação ficam livres do framework.
 */
export function provideUseCase<T>(
  useCase: Constructor<T>,
  inject: InjectionToken[],
): FactoryProvider<T> {
  return {
    provide: useCase,
    inject,
    useFactory: (...deps: unknown[]) =>
      new (useCase as unknown as new (...a: unknown[]) => T)(...deps),
  };
}
