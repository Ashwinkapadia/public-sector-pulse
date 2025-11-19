import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Building2, DollarSign, TrendingUp, MapPin, Globe, Users, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useOrganizationDetail, useOrganizationFunding } from "@/hooks/useOrganizationDetail";
import { AssignRepDialog } from "@/components/AssignRepDialog";
import { useUnassignRep } from "@/hooks/useRepAssignments";
import { format } from "date-fns";

export default function OrganizationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: org, isLoading: orgLoading } = useOrganizationDetail(id!);
  const { data: funding, isLoading: fundingLoading } = useOrganizationFunding(id!);
  const unassignRep = useUnassignRep();

  if (orgLoading) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!org) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-7xl mx-auto">
          <p className="text-muted-foreground">Organization not found</p>
        </div>
      </div>
    );
  }

  const assignedRep = org.rep_assignments;
  const totalFunding = funding?.reduce((sum, record) => sum + Number(record.amount), 0) || 0;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="max-w-7xl mx-auto p-6">
          <Button variant="ghost" onClick={() => navigate("/")} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>

          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <Building2 className="h-8 w-8 text-primary" />
                {org.name}
              </h1>
              <div className="flex items-center gap-4 text-muted-foreground">
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {org.city && org.state ? `${org.city}, ${org.state}` : org.state}
                </span>
                {org.industry && (
                  <Badge variant="secondary">
                    <Briefcase className="h-3 w-3 mr-1" />
                    {org.industry}
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {assignedRep ? (
                <>
                  <div className="text-right mr-2">
                    <p className="text-sm text-muted-foreground">Assigned to</p>
                    <p className="font-medium">{assignedRep.profiles.display_name || assignedRep.profiles.email}</p>
                  </div>
                  <AssignRepDialog
                    organizationId={org.id}
                    organizationName={org.name}
                    currentRepId={assignedRep.rep_id}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => unassignRep.mutate(org.id)}
                  >
                    Unassign
                  </Button>
                </>
              ) : (
                <AssignRepDialog organizationId={org.id} organizationName={org.name} />
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Funding</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalFunding)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Funding Records</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{funding?.length || 0}</div>
            </CardContent>
          </Card>

          {org.employee_count && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Employees</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{org.employee_count.toLocaleString()}</div>
              </CardContent>
            </Card>
          )}

          {org.annual_revenue && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Annual Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(Number(org.annual_revenue))}</div>
              </CardContent>
            </Card>
          )}
        </div>

        {org.description && (
          <Card>
            <CardHeader>
              <CardTitle>About</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{org.description}</p>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {org.website && (
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <a
                    href={org.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {org.website}
                  </a>
                </div>
              )}
              {org.address && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p>{org.address}</p>
                    {org.city && org.state && org.zip_code && (
                      <p className="text-muted-foreground">{`${org.city}, ${org.state} ${org.zip_code}`}</p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {assignedRep && (
            <Card>
              <CardHeader>
                <CardTitle>Assignment Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <p className="text-sm text-muted-foreground">Assigned Date</p>
                  <p className="font-medium">{format(new Date(assignedRep.assigned_at), "PPP")}</p>
                </div>
                {assignedRep.notes && (
                  <div>
                    <p className="text-sm text-muted-foreground">Notes</p>
                    <p className="text-sm">{assignedRep.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Funding History</CardTitle>
            <CardDescription>All funding records for this organization</CardDescription>
          </CardHeader>
          <CardContent>
            {fundingLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : funding && funding.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vertical</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Fiscal Year</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Period</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {funding.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">{record.verticals.name}</TableCell>
                      <TableCell>{formatCurrency(Number(record.amount))}</TableCell>
                      <TableCell>{record.fiscal_year}</TableCell>
                      <TableCell>
                        <Badge variant={record.status === "Active" ? "default" : "secondary"}>
                          {record.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {record.date_range_start && record.date_range_end
                          ? `${format(new Date(record.date_range_start), "MMM d, yyyy")} - ${format(new Date(record.date_range_end), "MMM d, yyyy")}`
                          : "N/A"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-muted-foreground py-8">No funding records found</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
