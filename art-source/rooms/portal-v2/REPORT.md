# Portal v2 — 2026-10-28

Pedido: rework do portal inspirado no Fantasy-portal-DND9.png enviado pelo dono no Discord.
Referência original preservada em reference.png (somente referência; não usada como textura).

Implementação em src/render/world/MerchantPortal.ts, integrada nos dois portais de MerchantRoom.ts.
Arco de pedra segmentado, pilares com runas, soleira, trepadeiras e folhas em geometria low-poly.
Vórtice âmbar com centro luminoso, filamentos espirais e movimento procedural em ShaderMaterial.
Moldura fica parada; somente a energia anima. Na arena encara a câmera; na sala acompanha a parede norte.
Abertura/expiração continuam usando a escala controlada pelo MerchantSystem. Gameplay não alterado.
O componente compartilhado também aparece na saída do iglu; decoração do iglu não foi alterada.

Quatro meshes por portal (pedra, vegetação, runas, passagem), 1.169 triângulos.
A geometria é agrupada por material com cores por vértice; não há textura nova nem luz adicional.
Passagem opaca com DoubleSide evita ver cenário através do vórtice. Cores seguem conversão do renderer.
O modelo antigo também tinha quatro meshes. Esta contagem isolada não é a contagem global do pipeline.
Valores globais medidos no navegador estão em browser-validation.json.

Validação:
- npm.cmd run build: TypeScript e Vite passaram (aviso de tamanho de bundle já existente).
- npm.cmd test -- --exclude tmp/** --exclude .claude/**: 473 testes / 38 arquivos passaram.
- git diff --check: passou.
- Chrome com GPU, pipeline real: zero erros de console/página/shader.
- Portal visível na arena; entrar abriu a sala; interagir na saída retornou à arena.
- Inspeção visual dos prints de detalhe, hub e arena concluída.

Arte nativa em Three.js: nenhum bitmap gerado por IA foi necessário.
QA reproduzível: iniciar Vite e executar node art-source/rooms/portal-v2/qa.mjs.
preview.html fornece close-up isolado; preview_*.png são screenshots reais do navegador.
Branch existente feature/snowfield-igloo, sem commit/push/PR. Alterações anteriores preservadas.

Correção de perspectiva solicitada pelo dono às 16:53:
- A saída herdava yaw de 45° da arena, ficando frontal à tela e desalinhada da parede.
- MerchantRoom agora define yaw 0 para a saída: soleira e arco acompanham o plano da parede norte.
- Screenshot do hub conferido; build/tsc e diff --check passaram; QA Chrome sem erros, entrada/saída passaram.
- QA reproduzível também verifica a rotação da saída. Prints atualizados nesta revisão.
