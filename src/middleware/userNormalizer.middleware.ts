// userNormalizer.middleware.ts
import { Request } from 'express';
import { User } from '../models/user.model';
export const normalizeUser = (req: Request, res: Response, next: NextFunction) => {
    if (req.user) {
      // If using Google auth, it might have _id instead of id
      if (!req.user.id && req.user._id) {
        req.user.id = req.user._id.toString();
      }
      
      // If using Google auth, it might have googleId but no id
      if (!req.user.id && req.user.googleId) {
        // Find user by googleId and set id properly
        User.findOne({ googleId: req.user.googleId })
          .then(user => {
            if (user) {
              req.user.id = user._id.toString();
              req.user.role = user.role;
            }
            next();
          })
          .catch(err => next(err));
      } else {
        next();
      }
    } else {
      next();
    }
  };