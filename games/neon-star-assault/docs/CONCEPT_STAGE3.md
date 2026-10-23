# Conceito artístico — Stage 3: SINGULARITY CROWN

## Narrativa
Depois da queda de Kharon-9, os destroços revelam a origem da frota: **Nyx**, um buraco negro cujo disco de acreção é explorado por uma treliça de cristais. No centro está o **Eclipse Sovereign**, um giroscópio colossal de três anéis que orbita uma singularidade viva. A missão termina quando o Soberano cai e Nyx colapsa numa nova de luz.

## Paleta
| Papel | Cores | Motivo |
| --- | --- | --- |
| Espaço | azul-marinho `#02060E`, teal `#06304A`, ciano `#1A8AB0` | Primeira fase **fria** do jogo, depois do violeta (Stage 1) e do carmesim (Stage 2) |
| Destaques | branco-gelo `#F0FFFF`, ciano `#7AF0FF` | Gás iluminado pela singularidade |
| Disco de acreção | branco-azulado → dourado `#FFB040` → laranja `#FF5A1A` | O único elemento quente do cenário, e a ameaça ao fundo |
| Tecnologia inimiga | ouro/âmbar (contorno `#FFB030`, frisos dourados, tiros `#FFC23A`) | Leitura imediata contra o fundo frio |
| Jogador | ciano (inalterado) | Continuidade |

## Linguagem de formas
- **Cristais** facetados (octaedros alongados, prismas hexagonais) com brilho interno azul.
- **Anéis, halos e círculos concêntricos**: portões de halo, os anéis do chefe, o anel de fótons de Nyx.
- Nada de blocos industriais: a fase contrasta com as nebulosas orgânicas do Stage 1 e as máquinas do Stage 2.

## Estrutura da fase
1. **Borda de Nyx**: espaço aberto, Nyx gigante à frente (cresce conforme a nave avança), cristais distantes, halos.
2. **Campo de cristais**: fragmentos destrutíveis na rota, que se fecham no final; minas.
3. **Portões de halo**: anéis colossais com barras de cristal girando; atravessar entre as barras.
4. **Poços gravitacionais** (mecânica nova): mini-singularidades que puxam a nave, com partículas mostrando o fluxo.
5. **Treliça do Soberano**: túnel aberto de cristais hexagonais em alta velocidade, com feixes.
6. **A Coroa**: arena do chefe diante de Nyx.

## Inimigo novo: Prism Lancer
Lança de cristal hexagonal girando, com barbatanas douradas em X. Carrega a ponta (brilho de aviso), dispara um orbe lento e o orbe **se estilhaça** em um leque de tiros mirado na posição atual do jogador. Destruí-lo durante a carga é a resposta ideal.

## Chefe: ECLIPSE SOVEREIGN
Três anéis giroscópicos (o externo é uma coroa de espinhos de cristal) em volta de uma singularidade com disco de acreção próprio.
- **Fase 1**: seis satélites de cristal orbitam à frente do núcleo e disparam em sequência. Há anéis de tiros com uma única brecha e lançamento de drones.
- **Fase 2**: o anel do meio vira de frente e expõe três nós. Na **varredura do horizonte**, dois feixes giram em volta de um círculo seguro no centro, marcado em dourado.
- **Fase 3**: os anéis se abrem, o núcleo fica exposto e **a gravidade puxa a nave**. Vêm espirais de tiros, anéis com brecha e chuva de cristais destrutíveis.
- **Derrota**: os anéis implodem na singularidade, seguidos da cutscene do colapso de Nyx.

## Onde está no código
- Fase: `src/stages/Stage3.js` (céu `SINGULARITY_SKY`, seções, eventos, poços gravitacionais)
- Buraco negro: `src/scenery/BlackHole.js`
- Chefe: `src/entities/bosses/EclipseSovereign.js` (parâmetros em `BOSSES.eclipseSovereign`)
- Inimigo: `src/entities/enemies/PrismLancer.js` (parâmetros em `ENEMIES.prismLancer`)
