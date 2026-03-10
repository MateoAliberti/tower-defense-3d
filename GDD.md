# Game Design Document — Tower Defense 3D
**Versión:** 1.0 (MVP)
**Fecha:** Marzo 2026
**Motor:** Three.js (navegador web, vanilla JS)

---

## 1. Visión General

Un juego de Tower Defense tridimensional que corre directamente en el navegador. El jugador coloca torres defensivas en un mapa de grilla 3D para evitar que oleadas de enemigos lleguen a la base. Perspectiva isométrica/orbital con cámara libre.

**Palabras clave:** estrategia, defensa, oleadas, economía, 3D

---

## 2. Mecánicas Principales

### 2.1 Mapa
- **Grilla de 20×14 tiles** (cada tile = 2x2 unidades 3D)
- **Camino fijo** predefinido por waypoints — serpentea por el mapa
- **Tiles de construcción:** cualquier tile que no sea camino
- **Decoraciones:** árboles, rocas en tiles no construibles (solo estética)

### 2.2 Torres

| Torre | Costo | Daño | Velocidad | Rango | Especial |
|-------|-------|------|-----------|-------|---------|
| **Pistola** (azul) | 50 💰 | 20 | Rápida | Media | Disparo único |
| **Cañón** (rojo) | 100 💰 | 80 | Lenta | Grande | Splash en 1.5u |
| **Láser** (verde) | 150 💰 | 12/tick | Continuo | Media | Quema, ignora armadura |

Cada torre tiene:
- **Nivel 1** (base)
- **Nivel 2** (upgrade × costo × 1.5)
- **Nivel 3** (upgrade × costo × 2.5)

El jugador hace click en una torre ya colocada para ver su info y opción de mejora/venta.

### 2.3 Enemigos

| Enemigo | Salud | Velocidad | Armadura | Recompensa | Especial |
|---------|-------|-----------|----------|-----------|---------|
| **Grunt** (verde) | 100 | Normal | 0% | 10 💰 | Básico |
| **Brute** (lila) | 350 | Lenta | 30% | 25 💰 | Resiste daño |
| **Scout** (amarillo) | 60 | Muy rápida | 0% | 15 💰 | Vuela bajo del radar |

Los enemigos siguen waypoints predefinidos del camino.

### 2.4 Sistema de Oleadas
- **Oleada 1–3:** Solo Grunts
- **Oleada 4–6:** Grunts + Brutes
- **Oleada 7–9:** Grunts + Brutes + Scouts
- **Oleada 10+:** Mix intensivo, escalado de salud ×1.15 por oleada

Intervalo entre enemigos: 0.8s base (reducido en oleadas altas)
Intervalo entre oleadas: 10s (el jugador puede acelerar o esperar)

### 2.5 Economía
- **Oro inicial:** 150 💰
- **Recompensa por enemigo muerto:** según tabla
- **Venta de torre:** 60% del costo total invertido
- **No hay interés entre oleadas** (MVP)

### 2.6 Vidas
- **20 vidas** al inicio
- Cada enemigo que llega al final resta vidas según su tipo (Grunt: 1, Brute: 3, Scout: 1)
- **Game Over** cuando las vidas llegan a 0

### 2.7 Victoria
- Sobrevivir las **15 oleadas** del modo MVP
- Futura versión: modo infinito

---

## 3. Cámara y Controles

| Acción | Control |
|--------|---------|
| Rotar cámara | Click derecho + arrastrar |
| Zoom | Rueda del ratón |
| Pan | Click medio + arrastrar |
| Seleccionar tile | Click izquierdo |
| Cancelar selección | Escape / click derecho |

**Posición inicial:** ángulo isométrico 45°, mirando el centro del mapa.

---

## 4. Interfaz de Usuario (HUD)

```
┌─────────────────────────────────────────────────────────────┐
│  💰 Oro: 150   ❤️ Vidas: 20   🌊 Oleada: 1/15        [▶] │
├──────────┬──────────────────────────────────────────────────┤
│  TORRES  │                                                  │
│ [Pistola]│                   CANVAS 3D                      │
│ [Cañón ] │                                                  │
│ [Láser ] │                (Three.js renderer)               │
│          │                                                  │
│          │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

- Panel de torre seleccionada: nombre, damage, rango, costo upgrade, botón nivel
- Tooltip al hover sobre tile de construcción
- Indicador de rango al colocar/seleccionar torre

---

## 5. Arte y Estilo

- **Estilo:** Low-poly 3D colorido (Poly Art)
- **Paleta:** cielo azul noche, terreno verde oscuro, camino beige/gris
- **Iluminación:** Luz direccional suave + ambient light azulado
- **Sombras:** PCF soft shadows
- **Efectos:** partículas en disparos, explosión del cañón, rayo láser persistente

---

## 6. Audio (MVP)

| Evento | Sonido |
|--------|--------|
| Disparo pistola | SFX corto |
| Explosión cañón | Bang grave |
| Láser activo | Zumbido |
| Enemigo muere | Pop |
| Vida perdida | Alarma |
| Game Over | Melodía corta triste |

> **MVP:** Generado con la Web Audio API (sin archivos externos).

---

## 7. Roadmap

### MVP (v1.0)
- [x] Escena 3D funcional
- [x] Mapa con camino
- [x] 3 torres básicas
- [x] 3 tipos de enemigos
- [x] Sistema de oleadas (15 oleadas)
- [x] HUD completo
- [x] Game Over / Victoria

### v1.1
- [ ] Mejoras de torre (niveles)
- [ ] Más mapas
- [ ] Efectos de sonido completos

### v1.2
- [ ] Modo infinito
- [ ] Leaderboard local
- [ ] Torres especiales (hielo, veneno)

---

## 8. Estructura de Archivos

```
tower defense/
├── GDD.md          ← Este documento
├── index.html      ← Punto de entrada
├── style.css       ← Estilos del HUD
└── game.js         ← Lógica completa del juego
```
