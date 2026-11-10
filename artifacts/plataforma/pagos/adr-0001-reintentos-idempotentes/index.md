---
type: adr
title: "ADR-0001: Reintentos idempotentes contra la pasarela de pagos"
author: Sebastian Vallejo
created: 2026-11-03
updated: 2026-11-10
status: accepted
tags: [pagos, resiliencia]
---
# ADR-0001: Reintentos idempotentes contra la pasarela de pagos

> [!NOTE]
> Contenido ficticio, usado para validar el render de Archidocs.

## Contexto

La pasarela responde con *timeouts* en el **0,8 %** de las autorizaciones en horas pico. Hoy reintentamos sin clave de idempotencia, y en octubre eso produjo **14 cobros duplicados**.

## Decisión

Cada intento de cobro envía una `Idempotency-Key` derivada del pedido y del número de intento lógico:

```ts
const key = sha256(`${order.id}:${attempt.logicalId}`);
await gateway.authorize(payment, { headers: { "Idempotency-Key": key } });
```

```mermaid
sequenceDiagram
  participant C as Checkout
  participant P as Pagos
  participant G as Pasarela
  C->>P: autorizar(pedido)
  P->>G: authorize + Idempotency-Key
  G--xP: timeout
  P->>G: authorize + misma Idempotency-Key
  G-->>P: 200 (resultado original)
  P-->>C: autorizado
```

## Alternativas consideradas

| Opción | A favor | En contra |
|---|---|---|
| Sin reintentos | Simple | Pierde ventas en cada timeout |
| Reintento sin clave | Recupera ventas | **Duplica cobros** |
| Reintento con clave idempotente | Recupera ventas sin duplicar | La clave debe sobrevivir a reinicios |

## Consecuencias

- [x] La clave se persiste antes del primer intento.
- [x] Los reintentos usan *backoff* exponencial con *jitter*.
- [ ] Alertar si la tasa de reintentos supera el 2 %.

> [!WARNING]
> La pasarela solo garantiza la idempotencia durante **24 h**; un reintento posterior se trata como un cobro nuevo.
