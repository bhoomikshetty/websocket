import express from 'express'
import { WebSocketServer } from 'ws'
import { createServer } from 'http'

import jsonwebtoken from 'jsonwebtoken'
import bodyParser from 'body-parser'

import dotenv from 'dotenv'
import { email, length, success, z } from 'zod'

import { User, Class, Attendance } from './mongoose.js'
import { error } from 'console'
import { da } from 'zod/locales'

import urll from 'url';

dotenv.config()
const app = express()
const router = express.Router()

router.post('/signup', verifyToken)

const server = createServer(app)
const wss = new WebSocketServer({ server })

app.use(express.json())
// app.use(verifyToken)
app.use(bodyParser.json());

var activeSession = {};

var sockets = [];

//wss is the main socket which listens for 
// any new client connection requests
wss.on('connection', (ws, req) => { // This "newSocketInstance" is the new instance for a new client
    const token = urll.parse(req.url).query.split("=")[1]
    const payload = decodeAccessToken(token)

    if (!payload) {
        res.send(JSON.stringify({
            "event": "ERROR",
            "data": {
                "message": "Unauthorized or invalid token"
            }
        }))
        ws.close()
    }

    ws.user = {
        'userId': payload._id,
        'role': payload.role,
    }

    ws.on('message', async (data, isBinary) => {
        console.error(ws.user)

        const eventData = JSON.parse(data.toString())
        if (ws.user.role === 'teacher' && eventData.event === 'ATTENDANCE_MARKED') {

            activeSession.attendance[eventData.data.studentId] = eventData.data.status;
            wss.clients.forEach((client) => {
                if (client.user.role === 'student') {

                    client.send(JSON.stringify(eventData));
                }
            })
        }


        if (ws.user.role === 'teacher' && eventData.event === 'TODAY_SUMMARY') {
            var list = Object.entries(activeSession.attendance)
            var present = Array.from(list)
                .filter(([key, value]) => value === 'present')
                .length;

            wss.clients.forEach((client) => {
                if (client.user.role === 'student') {
                    client.send(JSON.stringify({
                        "event": "TODAY_SUMMARY",
                        "data": {
                            "present": present,
                            "absent": list.length - present,
                            "total": list.length
                        }
                    }));
                }
            })
        }


        if (ws.user.role === 'student' && eventData.event === 'MY_ATTENDANCE') {
            ws.send(JSON.stringify({
                "event": "MY_ATTENDANCE",
                "data": {
                    "status": activeSession.attendance[ws.user.userId] ?? null
                }
            }))
        }

        if (ws.user.role === 'teacher' && eventData.event === 'DONE') {

            var user = await User.find({ role: 'student' })
            var _class = await Class.findById(activeSession.classId).populate(['studentIds'])

            _class.studentIds.forEach((student) => {
                if (activeSession.attendance[student._id.toString()] == null) {
                    activeSession.attendance[student._id.toString()] = 'absent'
                }
            });

            var list = Object.entries(activeSession.attendance)
            var newList = list.map(async (student) => await Attendance.create({
                classId: activeSession.classId,
                studentId: student[0],
                status: student[1],
            }));


            var list = Object.entries(activeSession.attendance)
            var present = Array.from(list)
                .filter(([key, value]) => value === 'present')
                .length;

            wss.clients.forEach((client) => {
                if (client.user.role === 'student') {
                    client.send(JSON.stringify({
                        "event": "DONE",
                        "data": {
                            "present": present,
                            "absent": list.length - present,
                            "total": list.length
                        }
                    }));
                }
            })
            activeSession = {};
        }
    })
})

















server.listen(3000, () => {
    console.log("Hello there!")
})

function verifyToken(token) {
    try {
        const user = jsonwebtoken.verify(token, process.env.JWT_ACCESS_TOKEN_PRIVATE_KEY)
    } catch (error) {
        console.error(error)
        return
    }
}

function generateAccessToken(payload) {
    return jsonwebtoken.sign(payload, process.env.JWT_REFRESH_TOKEN_PRIVATE_KEY)
}

function generateRefreshToken(payload) {
    return jsonwebtoken.sign(payload, process.env.JWT_REFRESH_TOKEN_PRIVATE_KEY)
}

app.post('/login', async (req, res) => {
    try {

        var logInData = LoginSchema.parse(req.body)

        const user = await User.findOne({ email: logInData.email })
        if (user) {
            if (logInData.password !== user.password) return res.status(400).json({
                "success": false,
                "error": "Invalid email or password"
            })

            const jwt = generateAccessToken({ _id: user._id, email: user.email, role: user.role })
            res.json({
                "success": true,
                "data": {
                    "token": jwt
                }
            })
        }
        else {
            return res.status(400).json({
                "success": false,
                "error": "Invalid email or password"
            })
        }

    } catch (error) {
        console.error(error)
        res.status(500).send()
    }
})

// TODO: all the cases of validation
app.post('/signup', async (req, res) => {
    try {
        var signUpData = SignupSchema.parse(req.body)

        const user = await User.create({
            name: signUpData.name,
            email: signUpData.email,
            password: signUpData.password,
            role: signUpData.role
        })

        res.status(201).send({
            success: true,
            data: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {

        if (error.code === 11000) {
            return res.status(400).json({ success: false, error: 'Email already exists' });
        }
        console.error(error)
        res.status(500).send()
    }
})

function decodeAccessToken(token) {
    return jsonwebtoken.decode(token, process.env.JWT_ACCESS_TOKEN_PRIVATE_KEY)
}

app.get('/auth/me', async (req, res) => {
    const token = req.headers.authorization;
    const payload = decodeAccessToken(token)

    if (!payload) {
        return res.status(403).json({
            success: false,
            error: "Unauthorized access",
        })
    }

    const user = await User.findById(payload._id)
    if (user) {
        return res.status(200).json({
            success: true,
            data: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        })
    }

    return res.status(403).json({ success: false, error: "Unauthorized access" })
})

app.post('/class', async (req, res) => {
    try {

        const token = req.headers.authorization;
        const payload = decodeAccessToken(token)

        if (!payload) {
            return res.status(403).json({
                success: false,
                error: "Unauthorized access",
            })
        }


        if (payload.role === 'teacher') {

            var classData = ClassSchema.parse(req.body)

            var _class = await Class.create({
                className: classData.className,
                teacherId: payload._id,
                studentIds: []
            })

            res.status(201).json({
                "success": true,
                "data": {
                    "_id": _class._id,
                    "className": _class.className,
                    "teacherId": _class.teacherId,
                    "studentIds": []
                }
            })
        } else {
            res.status(403).json({
                success: false,
                error: "Unauthorized access"
            })
        }
    } catch (error) {
        console.error(error)
        if (error.code === 11000) {
            return res.status(400).json({
                success: false
            })
        }
        res.status(500).json()
    }
})

app.post('/class/:classId/add-student', async (req, res) => {
    try {
        const classId = req.params.classId;

        const token = req.headers.authorization;
        const payload = decodeAccessToken(token)

        if (!payload) {
            return res.status(403).json({
                success: false,
                error: "Unauthorized access",
            })
        }

        const studentId = req.body.studentId;
        console.log(studentId)

        var _class = await Class.findById(classId)
        // .populate(['teacherId', 'studentIds'])

        if (_class) {
            if (_class.teacherId._id.toString() === payload._id) {
                var studentIds = []
                studentIds = _class.studentIds

                const user = await User.findById(studentId);
                if (!user) return res.status(400).json({
                    success: false,
                    error: `No student with id ${studentId} found`
                })
                if (studentIds.map((student) => student._id.toString()).includes(studentId)) {
                    return res.status(201).json({
                        success: false, error: "student already added to the class"
                    })
                }
                studentIds.push(studentId)
                await Class.findByIdAndUpdate(classId, { studentIds: studentIds })

                return res.status(201).json({
                    "success": true,
                    "data": {
                        "_id": _class._id,
                        "className": _class.name,
                        "teacherId": _class.teacherId._id.toString(),
                        "studentIds": studentIds
                    }
                })
            }
            else {
                res.status(403).json({ success: false, error: "Unauthorized access" })
            }

        }
        else {
            res.status(404).json({ success: false, error: "Class not found" })
        }

    } catch (error) {
        console.error(error)
        res.status(500).json()
    }

})



app.get('/class/:classId', async (req, res) => {
    const classId = req.params.classId;

    const token = req.headers.authorization;
    const payload = decodeAccessToken(token)

    if (!payload) {
        return res.status(403).json({
            success: false,
            error: "Unauthorized access",
        })
    }

    var _class = await Class.findById(classId).populate(['teacherId', 'studentIds'])

    if (_class.teacherId._id.toString() === payload._id || _class.studentIds.map((student) => student._id.toString()).includes(payload._id)) {

        var students = _class.studentIds.map((student) => ({
            _id: student._id,
            name: student.name,
            email: student.email
        }));
        return res.status(200).json({
            success: true,
            data: {
                _id: _class._id,
                className: _class.name,
                teacherId: _class.teacherId._id.toString(),
                students: students
            }
        })
    } else {
        res.status(400).json(
            {
                success: false,
                error: "No such record found"
            }
        )
    }
})

app.get('/students', async (req, res) => {

    const token = req.headers.authorization;
    const payload = decodeAccessToken(token)

    if (!payload) {
        return res.status(403).json({
            success: false,
            error: "Unauthorized access",
        })
    }

    if (payload.role === 'teacher') {
        var users = await User.find({ role: 'student' })
        var students = users.map((user) => ({
            _id: user._id,
            name: user.name,
            email: user.email
        }));

        res.status(200).json({ success: true, data: students })
    }
    else {
        res.status(400).json({
            success: false, error: "Unauthorized access"
        })
    }
})

// TODO: make the classId and studentId required in Atterndance Schema, 
// Refer
// [
//   {
//     _id: new ObjectId('6971300d86800c889b823605'),
//     classId: new ObjectId('696ff2ffb12f7eaf53a1e02f'),
//     studentId: new ObjectId('696febed114eebbc44012e17'),
//     status: 'present',
//     __v: 0
//   },
//   {
//     _id: new ObjectId('697131f1f95c41eff3b2f153'),
//     classId: new ObjectId('696ff2ffb12f7eaf53a1e02f'),
//     studentId: new ObjectId('696febed114eebbc44012e17'),
//     status: 'absent',
//     __v: 0
//   }
// ]


// TODO: CHECK AFTER WS IMPL
app.get('/class/:classId/my-attendance', async (req, res) => {
    const token = req.headers.authorization;
    const payload = decodeAccessToken(token)

    // res.send(activeSession)
    if (!payload) {
        return res.status(403).json({
            success: false,
            error: "Unauthorized access",
        })
    }

    const classId = req.params.classId
    var _class = await Class.findById(classId).populate(['studentIds'])

    if (payload.role === 'student') {

        if (_class.studentIds.map((student) => student._id.toString()).includes(payload._id)) {
            var attendance = await Attendance.find({ classId: classId, studentId: payload._id });

            console.log(attendance)
            if (attendance.length === 0) {
                return res.status(200).json({
                    success: true,
                    data: {
                        classId: classId,
                        status: null
                    }
                })
            }
            else {
                return res.status(200).json({
                    success: true,
                    data: {
                        classId: classId,
                        status: attendance[0].status,
                    }
                })
            }
        } else {
            return res.status(400).json({
                success: false,
                error: `Student ${payload._id} is not enrolled in class ${classId}`
            })
        }
    }
    else {
        return res.status(400).json({
            success: false,
            error: `Unauthorized access`
        })
    }

})


app.post('/attendance/start', async (req, res) => {
    try {
        console.log(activeSession.classId)
        if (activeSession.classId !== undefined) {
            return res.status(400).json({
                success: false,
                error: "Session already active"
            })
        }
        const attendanceStartData = AttendanceStartSchema.parse(req.body)

        const token = req.headers.authorization;
        const payload = decodeAccessToken(token)

        if (!payload || payload.role === 'student') {
            return res.status(403).json({
                success: false,
                error: "Unauthorized access",
            })
        }

        var _class = await Class.findById(attendanceStartData.classId)

        if (_class) {
            if (_class.teacherId._id.toString() === payload._id) {
                const date = new Date().toISOString()
                activeSession = {
                    classId: req.body.classId,
                    startedAt: date,
                    attendance: {}
                };

                return res.status(200).json({
                    "success": true,
                    "data": {
                        "classId": attendanceStartData.classId,
                        "startedAt": date
                    }
                })
            }
            else {
                res.status(403).json({ success: false, error: "Unauthorized access" })
            }

        }
        else {
            res.status(404).json({ success: false, error: "Class not found" })
        }

    } catch (error) {
        console.error(error)
        res.status(500).json()
    }
})


const RoleEnum = z.enum(["teacher", "student"])
const SignupSchema = z.object({
    name: z.string(),
    email: z.email(),
    password: z.string().min(6),
    role: RoleEnum
})

const LoginSchema = z.object({
    email: z.email(),
    password: z.string().min(6),
})

const ClassSchema = z.object({
    className: z.string(),
})

const AttendanceStartSchema = z.object({
    classId: z.string(),
})