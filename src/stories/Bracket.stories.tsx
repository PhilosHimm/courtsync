import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BracketView } from '@/components/app/BracketView';
import type { BracketStage } from '@/lib/event/bracket-stages';

const meta: Meta = { title: 'Components/Bracket' };
export default meta;

const stages: BracketStage[] = [
  {
    key: 'quarterfinals',
    label: 'Quarterfinals',
    matches: [
      {
        matchId: 'q1',
        slot: 'q1',
        title: 'QF 1',
        home: { kind: 'team', participantId: 'a', name: 'Example Aces' },
        away: { kind: 'bye' },
        status: 'scheduled',
        statusText: 'Bye',
        score: null,
        winner: null,
      },
      {
        matchId: 'q2',
        slot: 'q2',
        title: 'QF 2',
        home: { kind: 'team', participantId: 'b', name: 'Sample Setters' },
        away: { kind: 'team', participantId: 'c', name: 'Demo Diggers' },
        status: 'final',
        statusText: 'Final',
        score: '25–20, 25–22',
        winner: 'home',
      },
    ],
  },
  {
    key: 'semifinals',
    label: 'Semifinals',
    matches: [
      {
        matchId: 's1',
        slot: 's1',
        title: 'SF 1',
        home: { kind: 'team', participantId: 'a', name: 'Example Aces' },
        away: { kind: 'awaiting', from: 'q2', text: 'Winner of QF 2' },
        status: 'scheduled',
        statusText: 'Scheduled',
        score: null,
        winner: null,
      },
    ],
  },
];

/** A bye and "opponent to come" never read the same. */
export const Stages: StoryObj = {
  render: () => (
    <BracketView
      tier="gold"
      stages={stages}
      current="quarterfinals"
      hrefFor={() => '#'}
      mode="stages"
      listHref="#"
      stagesHref="#"
    />
  ),
};

export const AsList: StoryObj = {
  render: () => (
    <BracketView
      tier="gold"
      stages={stages}
      current={undefined}
      hrefFor={() => '#'}
      mode="list"
      listHref="#"
      stagesHref="#"
    />
  ),
};
