import { Router } from 'express';
import { z } from 'zod';
import { requireApiToken, sensitiveApiLimiter, isLocalSessionRequest } from '../security';
import { listLocalMessages, exportLocalMailArchive, importLocalMailArchive } from '../storage/mailRepository';

export function createLocalMailRouter(): Router {
  const router = Router();
  router.use('/api/local/mail-store',sensitiveApiLimiter,requireApiToken,(req,res,next)=>{
    res.setHeader('Cache-Control','no-store');
    if(!isLocalSessionRequest(req.socket.remoteAddress,req.headers.host)) return res.status(403).json({success:false,error:'Device-local mail data only.'});
    next();
  });
  router.get('/api/local/mail-store/messages',(req,res)=>{
    const parsed=z.object({accountId:z.string().min(1).max(100).optional(),folder:z.string().min(1).max(255).optional(),query:z.string().max(500).optional(),limit:z.coerce.number().int().min(1).max(100).default(50),offset:z.coerce.number().int().min(0).max(100000).default(0)}).strict().safeParse(req.query);
    if(!parsed.success)return res.status(400).json({success:false,error:'Invalid mail page.'});
    try{res.json({success:true,...listLocalMessages(parsed.data)});}catch{res.status(500).json({success:false,error:'Local mail data could not be opened. Existing data is preserved.'});}
  });
  const password=z.string().min(12).max(1024);
  router.post('/api/local/mail-store/export',(req,res)=>{
    const parsed=z.object({password}).strict().safeParse(req.body);
    if(!parsed.success)return res.status(400).json({success:false,error:'A backup password of at least 12 characters is required.'});
    try{res.json({success:true,archive:exportLocalMailArchive(parsed.data.password)});}catch{res.status(500).json({success:false,error:'Local backup could not be created.'});}
  });
  router.post('/api/local/mail-store/import',(req,res)=>{
    const parsed=z.object({password,archive:z.string().max(55*1024*1024),confirmReplace:z.literal(true)}).strict().safeParse(req.body);
    if(!parsed.success)return res.status(400).json({success:false,error:'A valid backup and explicit replacement confirmation are required.'});
    try{importLocalMailArchive(parsed.data.archive,parsed.data.password);res.json({success:true});}catch{res.status(400).json({success:false,error:'Backup could not be restored. Check the password and file. Existing data is preserved.'});}
  });
  return router;
}
