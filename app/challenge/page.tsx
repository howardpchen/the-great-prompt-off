import { ChallengeWorkspace } from "../components/ChallengeWorkspace";

export default function ChallengePage() {
  // Report contents are fetched only through the authenticated API.
  return <ChallengeWorkspace initialParticipantId="" reports={[]} />;
}
