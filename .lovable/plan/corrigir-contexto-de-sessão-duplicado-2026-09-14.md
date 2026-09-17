# Corrigir contexto de sessão duplicado

## Objetivo
Eliminar a tela em branco e garantir que todas as páginas, inclusive as administrativas, compartilhem a mesma sessão.

## Implementação
- Tornar o contexto de sessão uma instância única e estável mesmo quando o ambiente de desenvolvimento recarrega módulos separadamente.
- Manter o provedor global existente e preservar login, logout e carregamento de perfil.
- Validar a abertura direta de `/admin/colaboradores` e a navegação entre as telas administrativas.

## Detalhes técnicos
- Registrar o `SessionContext` em `globalThis` com uma chave global, evitando duas instâncias de contexto causadas pelo carregamento dividido e pela atualização automática do código.
- Confirmar que não há erros no navegador após recarregar a página administrativa.
