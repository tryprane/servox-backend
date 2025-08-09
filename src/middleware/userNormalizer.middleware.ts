// userNormalizer.middleware.ts
import { Request ,NextFunction } from 'express';
import { User } from '../models/user.model';
interface UserWithId {
  id: string;
  role:string;
  [key: string]: any;

}
export const normalizeUser = (req: Request, res: Response, next: NextFunction) => {
    if (req.user) {
      // If using Google auth, it might have _id instead of id
      if (!(req.user as UserWithId).id && (req.user as UserWithId)._id) {
        (req.user as UserWithId).id = (req.user as UserWithId)._id.toString();
      }
      
      // If using Google auth, it might have googleId but no id
      if (!( req.user as UserWithId).id && ( req.user as UserWithId).googleId) {
        // Find user by googleId and set id properly
        User.findOne({ googleId: ( req.user as UserWithId).googleId })
          .then(user => {
            if (user) {
              ( req.user as UserWithId).id = (user as UserWithId)._id.toString();
              ( req.user as UserWithId).role = user.role;
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