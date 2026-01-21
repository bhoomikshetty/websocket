import mongoose, { Schema } from "mongoose";
import { type } from "os";
import { required } from "zod/mini";

// const db = await mongoose.connect('mongodb://localhost:27017/websocket/?directConnection=true')
await mongoose.connect('mongodb://localhost:27017/websocket',).then(() => console.log("Connected to Mongodb"))
    .catch((err) => console.error('Error conneting to DB: ', err))

const dbInstance = mongoose.connection;
dbInstance.once('open', () => console.log("Open DB instance"))
dbInstance.once('connection', () => console.log("Open DB instance connection"))
dbInstance.once('close', () => console.log("Open DB instance connection"))


const UserSchema = new Schema({
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    role: {
        type: String,
        enum: ['teacher', 'student'],
        required: true
    }
}, { timestamps: true })
const User = mongoose.model('user', UserSchema)

// await User.deleteMany()

// console.log(await User.create({
//     name: "BHOOMIK",
//     email: 'shettybhoomik@gmail.ce',
//     password: 'pass',
//     role: 'teacher',
// }))

const ClassSchema = new Schema(
    {
        className: { type: String, required: true, unique: true },
        teacherId: {
            type: Schema.Types.ObjectId,
            ref: 'user'
        },
        studentIds: [{
            type: Schema.Types.ObjectId,
            ref: 'user'
        }]
    }
)

const Class = mongoose.model('class', ClassSchema)
// console.log(db)

const AttendanceSchema = new Schema({
    classId: {
        type: Schema.Types.ObjectId,
        unique: true,
        ref: 'class'
    },
    studentId: {
        type: Schema.Types.ObjectId,
        unique: true,
        ref: 'user'
    },
    status: {
        type: String,
        enum: ['present', 'absent'],
    }
})
const Attendance = mongoose.model('attendance', AttendanceSchema)

const newPromise = new Promise((resolve, reject) => {
    Math.random() < 0.5 ? resolve({
        "message": "Hey resoleve ho gaya"
    }) : reject({
        "message": "OOPS! reject ho gaya"
    })
})



fetch("https://api.genderize.io?name=luc").then((res) => console.log(res.body)).catch((err) => console.log("API ERROR", err))


// newPromise.then((res) => console.log("Promise resolverd", res))
// console.log("END")

// var test = '5' + 5 - 5
// test = undefined + 8
// test = 5 + undefined
// test = undefined + undefined
// test = undefined - undefined
// test = undefined + undefined

// console.log(test)
// console.log(typeof (test))


export { User, Class, Attendance }