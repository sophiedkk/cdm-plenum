<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0012. The discover phase: sources, a private-first brainstorm, an optional sort

- Status: Proposed; step 3 (the participant sort) superseded by [0020](0020-discover-first-look-board-and-grouping.md)
- Date: 2026-11-20
- Deciders: owner (private first, a maximal common data model, standard-agnostic wording, sorting step after validation), maintainer (design)

## Context and problem statement

In the first version the discover phase is one shared board: anyone adds an
element and everyone sees every element at once. After testing the demo the
owner asked for more emphasis on the brainstorm. The Delphi has a method
behind it; the brainstorm did not.

The literature on group ideation shows that people produce fewer and less
varied ideas when they see each other's ideas from the start. Nominal groups,
whose members work alone and pool their ideas, outproduce interactive groups,
mostly through production blocking (Diehl and Stroebe 1987,
<https://doi.org/10.1037/0022-3514.53.3.497>; meta-analysis Mullen, Johnson and
Salas 1991, <https://doi.org/10.1207/s15324834basp1201_1>). Other people's ideas
make participants conform and explore fewer domains, without raising the
number of ideas (Kohn and Smith 2011, <https://doi.org/10.1002/acp.1699>).
Working alone first and in the group second gives more and better ideas than
a team alone (Girotra, Terwiesch and Ulrich 2010,
<https://doi.org/10.1287/mnsc.1090.1144>). The nominal group technique builds
on the same order (Delbecq and Van de Ven 1971,
<https://doi.org/10.1177/002188637100700404>).

Projects that build a list of data elements start from what already exists.
The COMET Handbook builds the long list from systematic reviews, qualitative
work, audit data sets and stakeholders, groups different wordings of one item
under one name with the wording kept verbatim, and then groups the items into
domains (Williamson et al. 2017, <https://doi.org/10.1186/s13063-017-1978-4>,
section 2.7). The NINDS common data element project collected the forms of
existing studies first (Grinnon et al. 2012,
<https://doi.org/10.1177/1740774512438980>).

A common data model of a clinical concept aims at a maximal data set: every
element that any use case of the concept needs. openEHR states the principle
most clearly: each archetype "is intentionally designed to be inclusive of all
possible data elements that could be relevant for the topic and for all
possible clinical use cases" (Leslie 2014,
<https://openehr.atlassian.net/wiki/download/attachments/2949213/2014+07+openEHR+approach.pdf>).
It holds for any implementation standard. A FHIR profile often leaves fields
out because it is exchanged across a network, but the model it draws on should
still hold every element. The owner confirmed that cdm-plenum aims at that
maximal common data model, not at a minimal core set, and that its wording
stays independent of any one standard (2026-11-20).

## Considered options

1. Keep the shared board and add facilitation text only.
2. Three steps: collect sources, a private-first brainstorm with prompts, then
   group and clean up, with an optional participant sort before the grouping.
3. A full Group Concept Mapping run (brainstorm, sort, rate, statistical
   maps) as the discover phase.

## Decision outcome

Option 2. It adds the "alone first" order and the sources-first long list
that the evidence supports, and keeps the rating where it is: in the Delphi.
Option 1 leaves the board as it is. Option 3 duplicates the Delphi's rating
and makes every participant sort, the hardest step for participants: in one
concept mapping study 73% of the patients found brainstorming easy and 48%
found sorting easy (Mills et al. 2019,
<https://doi.org/10.1186/s41687-019-0147-9>).

The steps, with their requirements:

1. **Collect sources (EL12).** Participants add the forms, data sets,
   guidelines and models they work with. Each element records the sources it
   appears in, and the board shows the count, as the NINDS working groups saw
   how often each element was collected.
2. **Brainstorm, private first (EL13 to EL16).** By default each participant
   sees only their own elements until the facilitator reveals the board
   (owner decision 2026-11-20). The add screen asks four questions in
   clinicians' words: what is recorded, what about the patient is needed to
   interpret it, how it was measured, and in which context it is recorded.
   Clinical information models separate these parts, for example `data`,
   `state` and `protocol` in an openEHR OBSERVATION
   (<https://specifications.openehr.org/releases/RM/latest/ehr.html>); the
   questions themselves name no standard.
   No study tests these prompts for data elements; they are our own design,
   in line with the use of creativity triggers in requirements workshops
   (Maiden, Gizikis and Robertson 2004, <https://doi.org/10.1109/MS.2004.1331305>).
   After the reveal, participants mark "I support this" or "same as", which
   informs the facilitator and decides nothing. Examples show on demand
   only: in a study with 97 participants, examples on demand gave the most
   novel ideas, and examples at fixed intervals gave fewer ideas than none
   (Siangliulue et al. 2015, <https://doi.org/10.1145/2757226.2757230>).
3. **Sort, optional (EL8).** After the duplicates are merged, volunteers sort
   the elements into groups they make and name themselves (an open sort). The
   facilitator switches it on; it pays off from about 40 elements and 10
   sorters. Card sorts from 5 sorters correlate about 0.75 with the full
   result and from 15 sorters about 0.90 (Tullis and Wood, as reported by
   Nielsen 2004, <https://www.nngroup.com/articles/card-sorting-how-many-users-to-test/>).
   Critical care clinicians sorting data concepts produced consistent groups
   across methods (Reese et al. 2018, <https://doi.org/10.1093/jamia/ocy045>).
   Each sorter sees at most 60 elements. The facilitator gets a heat map of
   how often two elements share a group, suggested clusters and the group
   names, labelled as suggestions.
4. **Group and clean up (EL18, EL19).** The facilitator groups the elements,
   either by the four questions of the brainstorm or by groups of their own, and merges
   duplicates with the wording kept. A saturation view shows whether the
   last sources still added elements. The result is the list for Delphi
   round 1, which can take proposals for missing elements (DE16).

### Consequences

- Good: participants get one clear task per step, and the long list starts
  from existing practice instead of memory.
- Good: the Delphi rates a list that is wide, grouped and free of duplicates.
- Bad: the phase takes longer, and the facilitator decides when to reveal,
  when to sort and when the list is complete.
- The participant sort is grouped by meaning, not by importance; sorts that
  put everything in one pile or leave more than a quarter unsorted are
  flagged, because other concept mapping studies excluded up to 41% of sorts
  for such reasons (Mills et al. 2019).
- No source gives a numeric stopping rule for saturation; the saturation view
  shows the numbers and the facilitator decides.
