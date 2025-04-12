import { useState } from 'react';
import { GithubIcon, SearchIcon } from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { ModeToggle } from '@/components/mode-toggle';
import { format, fromUnixTime } from 'date-fns';

interface Repository {
  id: number;
  name: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  html_url: string;
}

interface CommitActivity {
  total: number;
  week: number;
  days: number[];
}

const GITHUB_TOKEN = import.meta.env.VITE_GITHUB_TOKEN;

function App() {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [commitData, setCommitData] = useState<CommitActivity[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>('');
  const { toast } = useToast();

  const fetchCommitActivity = async (owner: string, repo: string, retries = 3): Promise<CommitActivity[]> => {
    const headers = new Headers();
    if (GITHUB_TOKEN) headers.append('Authorization', `token ${GITHUB_TOKEN}`);

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/stats/commit_activity`,
      { headers }
    );

    if (response.status === 202 && retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return fetchCommitActivity(owner, repo, retries - 1);
    }

    if (response.status === 204) return [];
    if (!response.ok) throw new Error('Failed to fetch commit activity');

    return response.json();
  };

  const fetchGitHubData = async () => {
    if (!username) {
      toast({
        title: "Username required",
        description: "Please enter a GitHub username",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const headers = new Headers();
      if (GITHUB_TOKEN) headers.append('Authorization', `token ${GITHUB_TOKEN}`);

      const reposResponse = await fetch(
        `https://api.github.com/users/${username}/repos?sort=updated`,
        { headers }
      );

      const remaining = reposResponse.headers.get('X-RateLimit-Remaining');
      if (reposResponse.status === 403 && remaining === '0') {
        const resetTime = reposResponse.headers.get('X-RateLimit-Reset');
        const resetDate = resetTime ? new Date(parseInt(resetTime) * 1000) : new Date();
        throw new Error(`API rate limit exceeded. Try again after ${format(resetDate, 'PPpp')}`);
      }

      if (reposResponse.status === 404) throw new Error('User not found');
      if (!reposResponse.ok) throw new Error(`HTTP error! status: ${reposResponse.status}`);

      const reposData = await reposResponse.json();
      setRepos(reposData);

      if (reposData.length > 0) {
        const firstRepo = reposData[0].name;
        setSelectedRepo(firstRepo);
        const commitData = await fetchCommitActivity(username, firstRepo);
        setCommitData(commitData);
      }
    } catch (error) {
      let description = "Failed to fetch GitHub data";
      if (error instanceof Error) {
        description = error.message.startsWith('API rate limit') 
          ? `${error.message}${GITHUB_TOKEN ? '' : ' (Add GitHub token to increase limits)'}`
          : error.message;
      }
      toast({ title: "Error", description, variant: "destructive" });
      setRepos([]);
      setCommitData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRepoChange = async (repoName: string) => {
    setSelectedRepo(repoName);
    setLoading(true);
    try {
      const commitData = await fetchCommitActivity(username, repoName);
      setCommitData(commitData);
    } catch  {
      toast({
        title: "Error",
        description: "Failed to fetch commit activity for this repository.",
        variant: "destructive",
      });
      setCommitData([]);
    } finally {
      setLoading(false);
    }
  };

  const renderWeeklyView = () => {
    if (!commitData.length) return <NoDataMessage />;
    
    return (
      <div className="space-y-4">
        <div className="h-64 flex items-end space-x-1">
          {commitData.slice(-12).map((week, index) => {
            const maxTotal = Math.max(...commitData.map(w => w.total), 1);
            const date = fromUnixTime(week.week);
            return (
              <div
                key={index}
                className="bg-primary/80 hover:bg-primary transition-colors rounded-t-sm"
                style={{
                  height: `${(week.total / maxTotal) * 100}%`,
                  width: '8.33%',
                }}
                title={`${week.total} commits in week of ${format(date, 'MMM d, yyyy')}`}
              />
            );
          })}
        </div>
        <div className="flex justify-between text-sm text-muted-foreground">
          {commitData.slice(-12).map((week, index) => (
            <div key={index} className="w-[8.33%] text-center">
              {format(fromUnixTime(week.week), 'MMM d')}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderMonthlyView = () => {
    if (!commitData.length) return <NoDataMessage />;

    const monthlyData = commitData.reduce((acc, week) => {
      const date = fromUnixTime(week.week);
      const monthKey = format(date, 'MMM yyyy');
      acc[monthKey] = (acc[monthKey] || 0) + week.total;
      return acc;
    }, {} as Record<string, number>);

    const monthlyArray = Object.entries(monthlyData).slice(-12);
    const maxTotal = Math.max(...monthlyArray.map(([, total]) => total), 1);

    return (
      <div className="space-y-4">
        <div className="h-64 flex items-end space-x-2">
          {monthlyArray.map(([month, total], index) => (
            <div
              key={index}
              className="bg-primary/80 hover:bg-primary transition-colors rounded-t-sm"
              style={{
                height: `${(total / maxTotal) * 100}%`,
                width: '8.33%',
              }}
              title={`${total} commits in ${month}`}
            />
          ))}
        </div>
        <div className="flex justify-between text-sm text-muted-foreground">
          {monthlyArray.map(([month], index) => (
            <div key={index} className="w-[8.33%] text-center">
              {month.split(' ')[0]}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderYearlyView = () => {
    const weeks = commitData.slice(-52);
    const days = weeks.flatMap((week) => 
      week.days.map((count, dayIndex) => ({
        count,
        date: fromUnixTime(week.week + dayIndex * 86400)
      }))
    );

    if (!days.length || days.every(d => d.count === 0)) return <NoDataMessage />;

    const maxCount = Math.max(...days.map(d => d.count), 1);

    return (
      <div className="space-y-4">
        <div className="grid grid-rows-7 gap-1" 
          style={{ gridTemplateColumns: `repeat(${Math.ceil(days.length / 7)}, minmax(0, 1fr))` }}>
          {days.map((day, idx) => (
            <div
              key={idx}
              className="aspect-square rounded-sm"
              style={{
                backgroundColor: `hsl(var(--primary) / ${Math.min((day.count / maxCount) * 100, 100)}%)`,
              }}
              title={`${day.count} commits on ${format(day.date, 'MMM d, yyyy')}`}
            />
          ))}
        </div>
        <ColorScale />
      </div>
    );
  };

  const NoDataMessage = () => (
    <div className="text-center text-muted-foreground py-4">
      No commit activity found
    </div>
  );

  const ColorScale = () => (
    <div className="flex justify-between text-sm text-muted-foreground">
      <div>Less</div>
      <div className="flex gap-1">
        {[0, 25, 50, 75, 100].map((intensity) => (
          <div
            key={intensity}
            className="w-4 h-4 rounded-sm"
            style={{ backgroundColor: `hsl(var(--primary) / ${intensity}%` }}
          />
        ))}
      </div>
      <div>More</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <GithubIcon className="w-8 h-8" />
            <h1 className="text-3xl font-bold">GitHub Profile Analyzer</h1>
          </div>
          <ModeToggle />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Enter GitHub Username</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex space-x-2">
              <Input
                placeholder="e.g., octocat"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchGitHubData()}
              />
              <Button onClick={fetchGitHubData} disabled={loading}>
                {loading ? "Loading..." : <><SearchIcon className="w-4 h-4 mr-2" />Search</>}
              </Button>
            </div>
            {!GITHUB_TOKEN && (
              <p className="text-sm text-muted-foreground mt-2">
                Using unauthenticated API (60 requests/hr limit).{" "}
                <a
                  href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens"
                  target="_blank"
                  className="text-primary underline"
                >
                  Add GitHub token to increase limits
                </a>
              </p>
            )}
          </CardContent>
        </Card>

        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : repos.length > 0 ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Repositories</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Language</TableHead>
                      <TableHead>Stars</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {repos.map((repo) => (
                      <TableRow 
                        key={repo.id}
                        className={`cursor-pointer ${selectedRepo === repo.name ? 'bg-muted' : ''}`}
                        onClick={() => handleRepoChange(repo.name)}
                      >
                        <TableCell>
                          <a
                            href={repo.html_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {repo.name}
                          </a>
                        </TableCell>
                        <TableCell>{repo.description || '-'}</TableCell>
                        <TableCell>{repo.language || '-'}</TableCell>
                        <TableCell>{repo.stargazers_count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {selectedRepo && (
              <Card>
                <CardHeader>
                  <CardTitle>Commit Activity for {selectedRepo}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="weekly">
                    <TabsList>
                      <TabsTrigger value="weekly">Weekly</TabsTrigger>
                      <TabsTrigger value="monthly">Monthly</TabsTrigger>
                      <TabsTrigger value="yearly">Yearly</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="weekly" className="space-y-4">
                      {renderWeeklyView()}
                      <div className="text-sm text-muted-foreground text-center">
                        Last 12 weeks of commit activity
                      </div>
                    </TabsContent>

                    <TabsContent value="monthly" className="space-y-4">
                      {renderMonthlyView()}
                      <div className="text-sm text-muted-foreground text-center">
                        Last 12 months of commit activity
                      </div>
                    </TabsContent>

                    <TabsContent value="yearly" className="space-y-4">
                      {renderYearlyView()}
                      <div className="text-sm text-muted-foreground text-center">
                        Contribution activity for the past year
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

export default App;