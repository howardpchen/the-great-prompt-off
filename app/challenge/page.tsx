import { connection } from "next/server";
import { ChallengeWorkspace } from "../components/ChallengeWorkspace";
import { getPublicChallengeReports } from "../lib/challenge-data";

export default async function ChallengePage() {
  await connection();
  const reports = await getPublicChallengeReports();

  return <ChallengeWorkspace initialParticipantId="" reports={reports} />;
}
