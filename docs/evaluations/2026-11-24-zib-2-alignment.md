<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Aligning the model structure with zib 2.0

2026-11-24. Accepted by the owner on 2026-11-24, with the answers in
section 4. The owner asked to align cdm-plenum with the Nictiz zib 2.0
proposal; this file compares the two and proposes four changes. SC4, EL25,
EL26, DT6 and [ADR 0021](../adr/0021-model-structure-after-zib-2.md) cite it.

## Summary

Zib 2.0 makes the structure of a clinical model explicit: a model type, nested
sub-building blocks, and relations to other whole models. It follows the
openEHR entry types and derives each zib from one international model.
cdm-plenum already follows the zib 2.0 principles on content (a maximal set,
wide cardinality, separate value lists), but its models are a flat list of
elements under group headings. Four changes would close the gap:

1. **Model type** in the scope phase.
2. **One base model** in discover.
3. **Groups as structure** in the structure step of the detail phase: nesting,
   their own cardinality, and reusable sub-blocks.
4. **A reference element** that points to another whole model.

The UI stays standard-agnostic: it says "model type", "sub-block" and "refers
to another model", and names openEHR, FHIR or zib only where a feature is
specific to one.

## Sources

- Nictiz, *Architectuur zibs 2.0*, versie 1.0, 1 juli 2025
  (<https://www.nictiz.nl/document/architectuur-zibs-20-v10pdf>). Cited by
  principle number (P1 to P7).
- Nictiz, *Generieke bouwblokken als fundament voor databeschikbaarheid*,
  presentation of 28 april 2026
  (<https://www.nictiz.nl/document/20260414-presentatie-zorg-ict-nictiz-generieke-bouwblokken-als-hoeksteen-van-databeschikbaarheidpdf>).
  Cited by slide number.
- openEHR, *What reference model class to use when*
  (<https://openehr.atlassian.net/wiki/spaces/healthmod/pages/2949139/What+reference+model+class+to+use+when>),
  which the architecture document cites for P4.2.

The architecture document says several parts still need working out, such as
the list of design patterns and the rules for relations of type cause and
effect (P3.3, P4 implications). Nictiz plans to settle the zib 2.0 method
during 2026 (slide 16). This evaluation therefore aligns with the principles
and cites their numbers, so a later version can be checked against them.

## 1. What zib 2.0 says about structure

| Principle | What it says | cdm-plenum today |
| --- | --- | --- |
| P1.4 | A zib is a logical model, between the conceptual level (the care provider's language) and the technical level (FHIR, openEHR). | The tool builds a common data model before any standard; it fits the logical level. |
| P2.4 | A collection of zibs that forms a new concept, such as a discharge letter, is a composition, not a zib. | One project is one concept; no compositions. Matches. |
| P2.6 | A zib can contain *subbouwstenen*: groups of data elements that recur across zibs but are not a concept on their own (an anatomical location), or that keep a zib generic (a DNA result within a lab result). A sub-block is not a model on its own. | Groups (EL18) are headings for the rounds; they have no cardinality, do not nest and are not reusable. |
| P3.2 | A zib can refer to another zib, always the whole zib, never single data elements. Cause and effect, reason, and attributes such as author or patient are relations. | No element can refer to another model. |
| P3.3 | One zib, one concept. What is reusable apart from the concept becomes its own zib, linked by a relation; what is specific to a domain becomes a sub-block. Registration elements (identifiers, start date, author) are modelled explicitly. | The board has no way to mark an element as "a separate model" or "registration". |
| P4.2 | Zib categories follow design patterns, "naar analogie van openEHR entry archetypes: evaluation, observation, action, instruction", plus composition and cluster. | No model type. ADR 0020 already maps an imported OBSERVATION's data, state and protocol to starting groups. |
| P4.3 | A zib derives directly from an existing international model (an openEHR archetype or a FHIR resource or profile). International standards come before national ones. | Discover starts from existing models (ADR 0016) and compares several; none is marked as the base. |
| P4.4 | Cardinality is wide enough for every use; narrowed only when the zib is applied, never widened. Mandatory only when the zib would otherwise be ambiguous. | DT1: the widest any use case in scope needs. Matches. |
| P4.5 | A zib holds the maximal set of data, no longer the 80% of zibs 1.0. | DE1: the maximal data set. Matches. |
| P4.6 | Value lists are referenced from the zib and have their own lifecycle, static or dynamic. | DT5: the value set URL. Matches. |

Slides 10 to 14 of the presentation add the process: a *basismodel* from an
openEHR archetype or FHIR resource, Dutch agreements recorded on it, then
implementation artefacts (FHIR profiles, mappings, test material).

## 2. Proposed changes

### 2.1 Model type (P4.2)

In the scope phase the facilitator chooses the model type: observation,
evaluation, instruction, action or cluster (a reusable group on its own).
The type decides the starting groups, as ADR 0020 does for an imported
OBSERVATION today, and tells a later export (EX5 for ADL, EX6 for a FHIR
logical model) which root to write. The scope page shows the type with a
one-line explanation per type, after the openEHR page cited above.

Size: small. A project column, a field on the scope form, the starting
groups per type.

### 2.2 One base model (P4.3)

In the coverage table (EL20) the facilitator marks one imported source model
as the base. The table then shows, per other model, what it adds to the base,
and the first look (EL22) can start from the base model's elements.

Size: small to medium. A flag on the source model, a column order and a
"not in the base" marker.

### 2.3 Groups as structure (P2.6, P3.3)

In the structure step of the detail phase (DT1), the architect's proposal also
covers the tree:

- a group gets its own cardinality and can nest inside another group;
- a group can be marked a **sub-block**, reusable and not a model on its own,
  and optionally linked to an existing sub-block such as an openEHR CLUSTER
  archetype, the way EL4 links elements;
- an element can be marked as a **registration element** (identifier, start
  date, author), so it is modelled explicitly but can be hidden from care
  providers (P3.3).

The group answers the tree by consent, as for the rest of the structure.

Size: large. Elements and groups get a parent, groups get cardinality, and the
board, the rounds' group headings, the recap and the exports follow.

### 2.4 Reference element (P3.2)

A new element kind, "refers to another model", names a whole model (a zib, an
archetype or a profile) and carries a cardinality but no data type, codes or
values. It can be added on the board like any element and is rated in the
rounds. It also gives participants a way to say "this belongs in a model of
its own" (P3.3) without losing it.

Size: medium. An element kind, a link target, and the detail and export
handling of an element without a data type.

## 3. Order

1. Model type and the reference element (2.1, 2.4): small, and they change
   what participants see from the start.
2. The base model (2.2).
3. Groups as structure (2.3), which changes the data model most.

## 4. Questions and the owner's answers

1. Which of the four changes, and in which milestone? All four, in 0.3.0.
2. Who proposes the tree (2.3)? The architects or the facilitator, in the
   structure step of the detail phase, answered by consent.
3. Should the cluster type (2.1) let other projects refer to a project's
   sub-block? Not yet: the type only; references between projects come later.
4. Does the reference element (2.4) get its own rating question? No: it is
   rated with the same question as any element.
