import { handleUpload } from '@vercel/blob/client';
import { route, fail, parse, needUser } from './_lib.js';

export default route(async (req, res) => {
  if (req.method !== 'POST') throw fail(405, 'Metode tidak didukung.');
  const body = parse(req);
  const json = await handleUpload({
    body,
    request: req,
    onBeforeGenerateToken: async (_pathname, clientPayload) => {
      await needUser(clientPayload);
      return {
        allowedContentTypes: ['video/*', 'image/*'],
        maximumSizeInBytes: 200 * 1024 * 1024,
        addRandomSuffix: true,
      };
    },
    onUploadCompleted: async () => {},
  });
  res.json(json);
});
