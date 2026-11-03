import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";

export function Memory() {
  return (
    <div>
      <PageHeader
        title="Memory"
        description="Durable context NEXUS retains about you and your environment."
      />

      <Card>
        <EmptyState
          title="No memory records yet"
          description="Memory storage is modeled in the database foundation but is not populated or browsable in this release."
        />
      </Card>
    </div>
  );
}
