// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The facilitator's tables of an opened round: the response rate per stakeholder group (DE6)
// and, when the round allows it, who gave which rating (DE4).
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { m } from "@/i18n/messages";
import { expertTypeLabel } from "@/lib/i18n/round-labels";
import type { ParticipantRatings } from "@/server/rounds/rater-link";
import type { ResponseRate } from "@/server/rounds/results";

/** Invited, started and completed participants per stakeholder group, with the total. */
export function ResponseRateTable({ rate }: Readonly<{ rate: ResponseRate }>) {
  return (
    <Table>
      <TableCaption className="text-left">{m.rounds_response_caption()}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{m.rounds_response_group()}</TableHead>
          <TableHead scope="col">{m.rounds_response_type()}</TableHead>
          <TableHead scope="col">{m.rounds_response_invited()}</TableHead>
          <TableHead scope="col">{m.rounds_response_started()}</TableHead>
          <TableHead scope="col">{m.rounds_response_completed()}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rate.groups.map((group) => (
          <TableRow key={group.groupId}>
            <TableHead scope="row" className="font-normal">
              {group.groupName}
            </TableHead>
            <TableCell>{expertTypeLabel(group.expertType)}</TableCell>
            <TableCell>{group.invited}</TableCell>
            <TableCell>{group.started}</TableCell>
            <TableCell>{group.completed}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableHead scope="row">{m.rounds_response_total()}</TableHead>
          <TableCell />
          <TableCell>{rate.total.invited}</TableCell>
          <TableCell>{rate.total.started}</TableCell>
          <TableCell>{rate.total.completed}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

/** Each participant's ratings, one row per participant and one column per element. */
export function RatingsByParticipantTable({
  participants,
  elements,
}: Readonly<{
  participants: readonly ParticipantRatings[];
  elements: readonly { id: string; name: string }[];
}>) {
  if (participants.length === 0) {
    return <p className="text-muted-foreground">{m.rounds_by_participant_empty()}</p>;
  }
  return (
    <Table>
      <TableCaption className="text-left">{m.rounds_by_participant_caption()}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{m.rounds_by_participant_name()}</TableHead>
          <TableHead scope="col">{m.rounds_by_participant_group()}</TableHead>
          {elements.map((element) => (
            <TableHead key={element.id} scope="col">
              {element.name}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {participants.map((participant) => {
          const byElement = new Map(
            participant.ratings.map((rating) => [rating.elementId, rating]),
          );
          return (
            <TableRow key={participant.memberId}>
              <TableHead scope="row" className="font-normal">
                {participant.name || participant.email}
              </TableHead>
              <TableCell>{participant.groupName ?? m.rounds_by_participant_no_group()}</TableCell>
              {elements.map((element) => {
                const rating = byElement.get(element.id);
                return (
                  <TableCell key={element.id} className="whitespace-normal">
                    {rating === undefined
                      ? m.rounds_by_participant_not_rated()
                      : rating.score === null
                        ? m.rounds_rate_unable()
                        : rating.score}
                    {rating?.reason && (
                      <span className="block text-xs text-muted-foreground">{rating.reason}</span>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
