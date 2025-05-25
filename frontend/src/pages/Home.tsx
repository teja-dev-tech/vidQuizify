import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const Home = () => {
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Simulate upload progress
      setIsUploading(true);
      setUploadProgress(0);
      
      const interval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 100) {
            clearInterval(interval);
            setIsUploading(false);
            return 100;
          }
          return prev + 10;
        });
      }, 300);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-200 px-10 py-3">
        <div className="flex items-center gap-4">
          <div className="h-4 w-4">
            <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M36.7273 44C33.9891 44 31.6043 39.8386 30.3636 33.69C29.123 39.8386 26.7382 44 24 44C21.2618 44 18.877 39.8386 17.6364 33.69C16.3957 39.8386 14.0109 44 11.2727 44C7.25611 44 4 35.0457 4 24C4 12.9543 7.25611 4 11.2727 4C14.0109 4 16.3957 8.16144 17.6364 14.31C18.877 8.16144 21.2618 4 24 4C26.7382 4 29.123 8.16144 30.3636 14.31C31.6043 8.16144 33.9891 4 36.7273 4C40.7439 4 44 12.9543 44 24C44 35.0457 40.7439 44 36.7273 44Z"
                fill="currentColor"
              />
            </svg>
          </div>
          <h2 className="text-lg font-bold">VidQuizify</h2>
        </div>
        <div className="flex items-center gap-8">
          <nav className="flex items-center gap-9">
            <a href="#" className="text-sm font-medium">Home</a>
            <a href="#" className="text-sm font-medium">My Videos</a>
            <a href="#" className="text-sm font-medium">Pricing</a>
          </nav>
          <Button className="bg-blue-600 hover:bg-blue-700">
            New Video
          </Button>
          <Avatar>
            <AvatarImage src="https://lh3.googleusercontent.com/aida-public/AB6AXuDBIieE4fInJpmfn_f0XHlADGnz-TbRf9X5HKn4OYx3aV8Six8SNT-PXlg8BOddgfDX0F27F_zxQ9McCAkFB-ttfln1C4YKijyI8x2eWZt4F9My6KAkbDf3JuDq47UO_wca4o1l9xWWULV-RakWPzAWpIEp7zMiT5rqoZ0vcs3M1SRBp5JEi9LzTXjjcongGvElCHHieq6VTn082RI_aOGEaHox8duo1dzVtUywiT-HIjTy9KsZX8FbaDJzVdVvTqxZGEOuCDJybOs" />
            <AvatarFallback>U</AvatarFallback>
          </Avatar>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-40 py-5">
        <div className="mx-auto max-w-4xl">
          {/* Page Title */}
          <div className="p-4">
            <h1 className="text-3xl font-bold">Upload a Video</h1>
          </div>

          {/* Upload Area */}
          <div className="rounded-lg border-2 border-dashed border-gray-300 p-14 text-center">
            <div className="mx-auto max-w-md space-y-2">
              <p className="text-lg font-bold">Drag and drop a video file here, or click to select</p>
              <p className="text-sm text-gray-600">Upload a video file (MP4, ~60 mins, English lecture)</p>
            </div>
            <div className="mt-6">
              <Button variant="outline" className="relative">
                Select File
                <input
                  type="file"
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  accept="video/mp4"
                  onChange={handleFileChange}
                />
              </Button>
            </div>
          </div>

          {/* Upload Progress */}
          {isUploading && (
            <div className="mt-6 space-y-3 p-4">
              <div className="flex justify-between">
                <p className="font-medium">Uploading...</p>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-black transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-sm text-gray-500">{uploadProgress}%</p>
            </div>
          )}

          {/* Processing Status */}
          <div className="mt-8">
            <h2 className="px-4 pb-3 pt-5 text-xl font-bold">Processing Status</h2>
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[400px]">Process</TableHead>
                    <TableHead className="w-60">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Transcription</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" className="w-full">
                        Pending
                      </Button>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">MCQ Generation</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" className="w-full">
                        Pending
                      </Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Home;
