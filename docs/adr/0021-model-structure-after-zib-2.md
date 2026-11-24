<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0021. The model gets explicit structure, after zib 2.0

- Status: Accepted
- Date: 2026-11-24
- Deciders: owner (asked to align with zib 2.0 and answered the questions of
  the evaluation on 2026-11-24), maintainer (design)

## Context and problem statement

A cdm-plenum model is a flat list of elements under group headings. Nictiz's
zib 2.0 makes the structure of a clinical model explicit: a model category
after the openEHR entry types, sub-building blocks, relations to other whole
models, and one international base model (*Architectuur zibs 2.0*, versie 1.0,
1 juli 2025, <https://www.nictiz.nl/document/architectuur-zibs-20-v10pdf>,
principles P2.6, P3.2, P3.3, P4.2 and P4.3). The owner asked to align with it
before release 0.3.0. The [evaluation of 2026-11-24](../evaluations/2026-11-24-zib-2-alignment.md)
compares the two.

## Considered options

1. Keep the flat list and export structure only at the hand-off.
2. Add the four structural parts of the evaluation to the process.

## Decision outcome

Option 2 (owner decision 2026-11-24), in this order:

- **Model type (SC4):** chosen in the scope phase; sets the starting groups.
  The cluster type stays within its own project for now.
- **Reference element (EL26):** refers to a whole model by title and link;
  rated with the same question as any element.
- **Base model (EL25):** one source model in the coverage table.
- **Tree (DT6):** proposed by an architect or the facilitator as part of the
  structure step of the detail phase, and answered by consent.

The UI stays standard-agnostic ("model type", "sub-block", "refers to another
model"); it names openEHR, FHIR or zib only where a feature is specific to
one. Zib 2.0 is still being worked out (the list of design patterns, the rules
for relations); the requirements cite the principle numbers so a later version
can be checked against them.

### Consequences

- Good: a model leaves cdm-plenum in the shape zib 2.0 and openEHR expect,
  with its type, sub-blocks and references.
- Good: participants can say "this belongs in a model of its own" without
  losing the element.
- Bad: the tree (DT6) changes the data model of elements and groups; the
  board, the round headings, the recap and the exports follow.
