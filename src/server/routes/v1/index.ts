import { Router } from 'express';
import { usersRouter } from './users.js';
import { coursesRouter } from './courses.js';
import { membershipsRouter } from './memberships.js';
import { authRouter } from './auth.js';
import { assignmentsRouter } from './assignments.js';

export const v1Router = Router();

v1Router.get('/', (_req, res) => {
  res.json({ name: 'GradeDescent API', version: 'v1' });
});

v1Router.use('/auth', authRouter);
v1Router.use('/users', usersRouter);
v1Router.use('/courses', coursesRouter);
v1Router.use('/courses/:courseId/assignments', assignmentsRouter);
v1Router.use('/memberships', membershipsRouter);
