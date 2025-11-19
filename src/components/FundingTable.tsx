import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface FundingTableProps {
  state?: string;
}

export function FundingTable({ state }: FundingTableProps) {
  // Mock data - will be replaced with real data
  const organizations = [
    {
      name: "California Employment Development Department",
      vertical: "Workforce Development",
      funding: "$26.36B",
      status: "Active",
      lastUpdated: "2025-03-15",
    },
    {
      name: "New York State Office for the Aging",
      vertical: "Aging Services",
      funding: "$406M",
      status: "Active",
      lastUpdated: "2025-02-28",
    },
    {
      name: "Texas Workforce Commission",
      vertical: "Workforce Development",
      funding: "$3.06B",
      status: "Active",
      lastUpdated: "2025-03-01",
    },
    {
      name: "Illinois Department on Aging",
      vertical: "Aging Services",
      funding: "$616M",
      status: "Active",
      lastUpdated: "2025-01-20",
    },
    {
      name: "California Violence Intervention Program",
      vertical: "CVI Prevention",
      funding: "$58M",
      status: "Active",
      lastUpdated: "2025-03-10",
    },
  ];

  // Filter by state if selected
  const filteredOrgs = state
    ? organizations.filter((org) =>
        org.name.toLowerCase().includes(state.toLowerCase()) ||
        org.name.includes(state)
      )
    : organizations;

  return (
    <Card className="p-6">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-foreground">
          Organizations Receiving Funding
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Key government agencies and departments with active funding
        </p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organization</TableHead>
              <TableHead>Vertical</TableHead>
              <TableHead>Funding</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredOrgs.map((org, index) => (
              <TableRow key={index}>
                <TableCell className="font-medium">{org.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{org.vertical}</Badge>
                </TableCell>
                <TableCell className="font-semibold">{org.funding}</TableCell>
                <TableCell>
                  <Badge className="bg-accent text-accent-foreground">
                    {org.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {org.lastUpdated}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
