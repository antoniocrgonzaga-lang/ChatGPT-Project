# NEON STAR ASSAULT

**[▶ Jogar online](https://antoniocrgonzaga-lang.github.io/ChatGPT-Project/games/neon-star-assault/)** · [Coleção ChatGPT Project](https://antoniocrgonzaga-lang.github.io/ChatGPT-Project/)

Rail shooter espacial 3D em terceira pessoa feito com **Three.js** (JavaScript ES modules), com quatro estágios completos e quatro chefes (3, 4, 3 e 3 fases), pós-processamento com bloom, partículas, áudio procedural e HUD em HTML/CSS.

- **Stage 1 — Neon Nebula Run**: espaço aberto → campo de asteroides → frota interceptadora → destroços da Estação Lyra (com **rota oculta**) → túnel de anéis → tempestade eletromagnética → **Nebula Warden**.
- **Transição**: portal dimensional + túnel de dobra, paleta muda de violeta para carmesim sem recarregar a página.
- **Stage 2 — Crimson Machine World**: aproximação orbital → superfície → floresta de torres → abertura mecânica → túnel de alta velocidade → sala dos reatores → corredor de portas → **The Crimson Architect** → fuga de 30 s → explosão do planeta → salto dimensional.
- **Stage 3 — Singularity Crown**: borda do buraco negro Nyx → campo de cristais → portões de halo → poços gravitacionais → treliça de cristal em alta velocidade → **Eclipse Sovereign** → colapso da singularidade → salto dimensional. Conceito artístico completo em [docs/CONCEPT_STAGE3.md](docs/CONCEPT_STAGE3.md).
- **Stage 4 — Abyssal Armada**: o vazio fora da galáxia (galáxia espiral no céu) → armada de cruzadores com salvas laterais → sombra da nave-mãe Leviatã → trincheira no casco → hangar → conduto do núcleo com grades de contenção → **Abyssal Matriarch** → a Leviatã se parte → vitória. Conceito artístico completo em [docs/CONCEPT_STAGE4.md](docs/CONCEPT_STAGE4.md).

## Executar

Requer um servidor local (os módulos ES e o modelo `.glb` não carregam via `file://`).

**Atalho no Windows:** dê dois cliques em `start.bat`. Ele instala as dependências na primeira vez, inicia o Vite e abre o navegador. Sem Node.js, usa o Python (`http://localhost:8080`).

**Opção 1 — Vite (recomendado)**

```bash
npm install
```

```bash
npm run dev
```

Abra `http://localhost:5173`. Para gerar a versão final em `dist/`: `npm run build` (o modelo em `assets/` é copiado automaticamente).

**Opção 2 — Live Server (VS Code) ou qualquer servidor estático**

Abra a pasta do projeto e sirva o `index.html`. O Three.js está copiado em `vendor/three/` e é resolvido por um *import map*, então **não é preciso `npm install`** nesse modo. Exemplo sem VS Code:

```bash
python -m http.server 8080
```

Não há dependências externas em tempo de execução: texturas, sons, músicas, cenários, inimigos e chefes são gerados proceduralmente. Os únicos arquivos externos são os modelos das naves do jogador (`assets/models/player_ship.glb`, `vx04.glb` e `nave_pesada.glb`); se um deles não carregar, o jogo usa uma nave procedural e mostra um aviso na tela de título.

## Vidas e power-ups

Na tela inicial o jogador escolhe a nave (setas ← / → ou clique): a **VX-9 Lumen Lance** é ágil e tem 3 blocos de casco; a **VX-04 Lance** é mais lenta e tem 4; a **KZ-13 Carrasco** é a mais lenta, tem 4 blocos e dispara tiros vermelhos mais lentos e grossos que causam o dobro de dano. O jogador tem **3 vidas**, e cada vida tem o casco completo da nave (HULL). Ao zerar o casco, a nave explode, perde uma vida e renasce no centro com alguns segundos de invulnerabilidade. **Rapid Fire** e **Dual Cannon** duram a vida inteira e só são perdidos quando a nave é destruída. Game over acontece ao perder a última vida; *Continuar* recomeça do checkpoint com as 3 vidas.

A cada **10 000 pontos** o casco recupera 1 bloco e a cada **50 000 pontos** o jogador ganha uma vida extra (até 9). Asteroides, vigas cruzando o caminho, destroços da fuga e os blocos que caem no chefe final podem ser destruídos com alguns tiros (os maiores aguentam mais) e têm chance de soltar power-ups. Hélices, portas de segurança, torres no caminho e as paredes do chefe continuam indestrutíveis.

## Controles

| Tecla | Ação |
| --- | --- |
| WASD / Setas | Mover a nave |
| Espaço (segurar) | Disparo principal contínuo |
| C ou J (segurar e soltar) | Tiro carregado (persegue o alvo marcado, dano em área) |
| Shift | Esquiva rápida (≈0,4 s de invulnerabilidade) |
| E | Bomba de energia |
| P / Esc | Pausar |
| Enter | Iniciar / continuar |
| M | Silenciar |
| Gamepad | Analógico move · A atira · RT/LT carrega · B/RB/LB esquiva · X/Y bomba · Start pausa |

Dica: no Stage 1, destrua os **3 geradores** antes da barreira para abrir a rota oculta (mais difícil, +25 000 pontos).

## Onde ajustar as coisas

Quase tudo está em **`src/config/gameConfig.js`**:

| O quê | Constante |
| --- | --- |
| Título do jogo / subtítulo | `GAME_TITLE`, `GAME_SUBTITLE` |
| Vidas, renascimento, bombas, hitbox, invulnerabilidade, esquiva | `PLAYER` |
| Naves selecionáveis: nome, modelo (arquivo, envergadura, rotação, sockets de tiro e motores), casco, velocidade, arma própria (`shot`) e cores de tiro/motor (`colors`) | `SHIPS`, `DEFAULT_SHIP` |
| Dano, cadência, tiro carregado, bomba | `WEAPONS` |
| Power-ups (cores, chance de drop, bônus por repetido) | `POWERUPS` |
| Pontuação, combo, marcos de reparo / vida extra | `SCORING` |
| Resistência, pontos e chance de drop dos obstáculos destrutíveis | `OBSTACLES` |
| Vida/comportamento dos inimigos, escala dos modelos | `ENEMIES`, `ENEMY_MODEL_SCALE`, `ENEMY_BULLET` |
| Vida, distância e fases dos chefes | `BOSSES` |
| Velocidades de trilho do chefe e da fuga | `RAIL` |
| Câmera (FOV, atraso, shake) | `CAMERA` |
| Bloom (intensidade, raio, limiar) | `BLOOM` (e `bloomStrength` por qualidade) |
| Cores de tiros e retícula | `COLORS` |
| Volume padrão | `AUDIO` |
| Dificuldade (Fácil / Normal / Difícil) | `DIFFICULTY` |
| Qualidade Low / Medium / High | `QUALITY` |

O visual do céu do Stage 1 (cores e posição das nebulosas, faixa galáctica, poeira) é o objeto `NEBULA_SKY` em `src/stages/Stage1.js`; o tom do céu por seção é o campo `sky` de cada seção. Cores e paleta de cada estágio (neblina, luzes, nebulosas, cor dos tiros inimigos) ficam no objeto `theme` e em cada seção de `src/stages/Stage1.js` e `src/stages/Stage2.js`. A sequência de inimigos de cada estágio é a lista `events` desses arquivos (disparados pela distância percorrida no trilho).

## Arquitetura

```
index.html · style.css · vite.config.js
assets/models/*.glb                naves do jogador (Blender, frente -Z; sockets de tiro e motores configurados em SHIPS)
vendor/three/                       cópia local do Three.js r186 + addons usados
src/
  main.js                           ponto de entrada
  config/gameConfig.js              todos os parâmetros ajustáveis
  core/
    Game.js                         renderer, loop único (rAF), máquina de estados, callbacks de jogo
    InputManager.js                 teclado + gamepad (captura toques mais curtos que um frame)
    AudioManager.js                 SFX procedurais (Web Audio) + hook para arquivos (AUDIO_FILES)
    MusicSequencer.js               trilhas procedurais por estágio/chefe com níveis de intensidade
    AssetManager.js                 texturas canvas, materiais, geometrias, env maps, carga do .glb
    CameraRig.js                    câmera de perseguição, FOV dinâmico, shake, vitrine e cutscene
    PostFX.js                       EffectComposer: Render → UnrealBloom → shader final → Output
    DebugTools.js                   modo debug (?debug)
  systems/
    Rail.js                         trilho CatmullRom por comprimento de arco + ramo alternativo
    StageManager.js                 streaming de cenário por chunks, eventos, seções, chefe, checkpoints
    SpawnSystem.js                  pools de inimigos e formações
    ProjectileSystem.js             projéteis em InstancedMesh (pool fixo)
    CollisionSystem.js              esferas / caixas orientadas / segmentos (testes varridos)
    ObstacleSystem.js               obstáculos, feixes telegrafados e anéis de bônus
    ParticleSystem.js               partículas em BufferGeometry (shader próprio)
    EffectsSystem.js                explosões, faíscas, ondas de choque, destroços, luzes de flash
    PowerUpSystem.js · ScoreSystem.js
    Sequences.js                    portal entre estágios, fuga final, cutscene da explosão
  entities/
    PlayerShip.js                   movimento, armas, esquiva, dano, rastros, escudo, retícula
    Enemy.js + enemies/*            Scout, Interceptor, DroneTurret, HeavyFighter, Mine, Carrier,
                                    PhaseHunter (só Stage 2), PrismLancer (só Stage 3), Generator — registro em enemies/index.js
    Boss.js + bosses/*              NebulaWarden (3 fases), CrimsonArchitect (4 fases), EclipseSovereign (3 fases),
                                    AbyssalMatriarch (3 fases)
    ContainmentGrid.js              grade de feixes com uma única célula livre (Stage 4)
    Obstacle.js · Beam.js · PowerUp.js · models/FallbackShip.js
    models/ModelBuilder.js          une as peças de cada modelo por material, com geometria em cache por tipo
    models/shapes.js                cascos extrudados de contornos 2D, naceles (lathe), barbatanas e frisos
  effects/                          materiais de escudo/fluxo e rastro de motor
  scenery/                          céu (estrelas, nebulosas, poeira) e kit de peças procedurais
    NebulaSkybox.js                 skybox procedural dos Stages 1, 3 e 4 (nebulosas e galáxia espiral, gerado na GPU no loading)
    BlackHole.js                    buraco negro com disco de acreção animado (céu, poços, chefe e cutscene)
    Mothership.js                   nave-mãe Leviatã e cruzadores procedurais (céu, armada e cutscene final)
  stages/Stage1.js … Stage4.js      trajetória, seções (construtores de cenário) e roteiro de eventos
  ui/HUD.js · Screens.js            HUD e telas (loading, título, instruções, pausa, game over, vitória)
```

**Adicionar um estágio**: crie `src/stages/Stage4.js` seguindo o formato dos existentes e inclua-o em `STAGES` (`src/core/Game.js`). O campo `outro` define como o estágio termina: `'portal'` (padrão), `'escape'` (fuga + cutscene), `'cutscene'` (cutscene e depois salto para o próximo estágio) ou `'final'` (cutscene de vitória; o texto da vitória é o campo `victory` do último estágio).
**Adicionar um inimigo**: estenda `Enemy` em `src/entities/enemies/`, registre em `enemies/index.js` e adicione os parâmetros em `ENEMIES`.
**Trocar sons por arquivos**: preencha `AUDIO_FILES` em `src/core/AudioManager.js` (ex.: `{ explosion: 'assets/audio/boom.ogg', 'music:stage1': 'assets/audio/stage1.ogg' }`).

Desempenho: object pooling (inimigos, projéteis, partículas, destroços, anéis, flashes), geometrias/materiais compartilhados, cenário gerado e descartado por chunks, shaders pré-compilados no loading, pixel ratio limitado e três níveis de qualidade (partículas, resolução do bloom, distância de desenho, estrelas, luzes, sombras).

## Modo debug

Abra com `?debug` (ex.: `http://localhost:5173/?debug`). Opções de URL: `&stage=2` começa no Stage 2 (1 a 4), `&boss` pula para o chefe, `&god` invencível, `&hitbox` mostra hitboxes, `&bot` liga o bot de testes, `&gallery` abre a galeria com todos os inimigos girando lado a lado.

| Tecla | Ação |
| --- | --- |
| H | Mostrar/ocultar hitboxes |
| G | God mode |
| N | Pular para a próxima seção |
| B | Pular para o chefe |
| K | Causar dano ao chefe |
| T | Câmera lenta |
| Y | Bot de testes (mira e atira sozinho) |
| 1 / 2 / 3 / 4 | Iniciar Stage 1 / 2 / 3 / 4 |

No console: `__game.debug.simulate(30)` avança 30 s de lógica sem renderizar e retorna um resumo do estado — útil para testes de regressão.
