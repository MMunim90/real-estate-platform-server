const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { ObjectId, MongoClient, ServerApiVersion } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.actwx8z.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    //collection
    const db = client.db("Real_State_db");
    const usersCollection = db.collection("users");
    const propertiesCollection = db.collection("properties");
    const wishlistCollection = db.collection("wishlist");
    const reviewsCollection = db.collection("reviews");

    // custom middlewares

    // verify firebase token
    const verifyFBToken = async (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      const token = authHeader.split(" ")[1];
      if (!token) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      //verify the token
      try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.decoded = decoded;
        next();
      } catch (error) {
        return res.status(403).send({ message: "forbidden access" });
      }
    };

    // verify admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email };
      const user = await usersCollection.findOne(query);

      if (!user || user.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // get all users
    app.get("/users", async (req, res) => {
      try {
        const result = await usersCollection.find({}).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching user", error);
        res.status(500).send({ message: "Server error" });
      }
    });

    // post user info
    app.post("/users", async (req, res) => {
      const email = req.body.email;
      const userExists = await usersCollection.findOne({ email });
      if (userExists) {
        return res
          .status(200)
          .send({ message: "User already exists", inserted: false });
      }

      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // find user role
    app.get("/users/role/:email", async (req, res) => {
      const email = req.params.email;

      if (!email) {
        return res.status(400).send({ message: "Email is required" });
      }

      try {
        const user = await usersCollection.findOne(
          { email },
          { projection: { role: 1 } } // Only fetch the role field
        );

        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send({ role: user.role || "user" }); // Default to "user" if no role
      } catch (error) {
        console.error("Error fetching user role:", error);
        res.status(500).send({ message: "Server error" });
      }
    });

    // update user name
    app.patch("/users/updateName", async (req, res) => {
      try {
        const { email, displayName } = req.body;

        if (!email || !displayName) {
          return res
            .status(400)
            .json({ message: "Email and displayName are required" });
        }

        const result = await usersCollection.updateOne(
          { email: email },
          { $set: { displayName: displayName } }
        );

        if (result.modifiedCount > 0) {
          res.send({ message: "Display name updated successfully" });
        } else {
          res
            .status(404)
            .send({ message: "User not found or already has this name" });
        }
      } catch (error) {
        console.error("Error updating display name:", error);
        res.status(500).send({ message: "Server error" });
      }
    });

    // added user media links
    app.patch("/users", async (req, res) => {
      try {
        const { applicant, facebook, twitter, whatsapp } = req.body;

        if (!applicant) {
          return res.status(400).json({ error: "Applicant email is required" });
        }

        const result = await usersCollection.updateOne(
          { email: applicant },
          {
            $set: { facebook, twitter, whatsapp },
          }
        );

        console.log("Update result:", result);
        res.json(result);
      } catch (error) {
        console.error("PATCH /users error:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    // GET /users/socials?email=user@example.com
    app.get("/users/socials", async (req, res) => {
      try {
        const email = req.query.email;

        if (!email) {
          return res
            .status(400)
            .json({ error: "Email query parameter is required" });
        }

        const user = await usersCollection.findOne(
          { email },
          {
            projection: {
              _id: 0,
              facebook: 1,
              twitter: 1,
              whatsapp: 1,
            },
          }
        );

        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        res.json(user); // returns { facebook, twitter, whatsapp }
      } catch (error) {
        console.error("GET /users/socials error:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    // POST /addProperties
    app.post("/addProperties", async (req, res) => {
      try {
        const property = req.body;

        if (
          !property.title ||
          !property.location ||
          !property.image ||
          !property.agentName ||
          !property.agentEmail ||
          !property.agentImage ||
          !property.minRate ||
          !property.maxRate
        ) {
          return res
            .status(400)
            .json({ error: "All required fields must be provided." });
        }

        property.minRate = Number(property.minRate);
        property.maxRate = Number(property.maxRate);

        property.status = "available";
        property.createdAt = new Date();

        const result = await propertiesCollection.insertOne(property);
        res.status(201).json({
          message: "Property added successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Failed to add property:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    //get added property of a single agent
    app.get("/properties", async (req, res) => {
      try {
        const { agentEmail } = req.query;

        let query = {};
        if (agentEmail) {
          query.agentEmail = agentEmail;
        }

        const properties = await propertiesCollection.find(query).toArray();
        res.send(properties);
      } catch (error) {
        console.error("Error fetching properties:", error);
        res.status(500).send({ message: "Server error" });
      }
    });

    // get all pending properties on admin manage properties
    app.get("/manage-properties", async (req, res) => {
      try {
        const result = await propertiesCollection
          .find({ status: "available" }) // 'available' means not yet verified or rejected
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch properties" });
      }
    });

    // update property by agent
    app.patch("/properties/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const updatedData = req.body;

        updatedData.installments = Number(updatedData.installments);

        const result = await propertiesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "Property not found" });
        }

        res.json({ message: "Property updated successfully" });
      } catch (error) {
        console.error("Failed to update property", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // verify a property from admin manage property
    app.patch("/properties/verify/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await propertiesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "verified" } }
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to verify property" });
      }
    });

    // reject a property from admin manage property
    app.patch("/properties/reject/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await propertiesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "rejected" } }
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to reject property" });
      }
    });

    // get all verified properties
    app.get("/properties/verified", async (req, res) => {
      try {
        const verifiedProperties = await propertiesCollection
          .find({ status: "verified" })
          .toArray();
        res.json(verifiedProperties);
      } catch (err) {
        res.status(500).json({ error: "Failed to fetch verified properties" });
      }
    });

    // get single property details on property details page
    app.get("/properties/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const property = await propertiesCollection.findOne({
          _id: new ObjectId(id),
        });
        res.json(property);
      } catch (err) {
        res.status(500).json({ error: "Failed to fetch property details" });
      }
    });

    // get reviews by property ID
    app.get("/reviews", async (req, res) => {
      try {
        const { propertyId } = req.query;

        if (!propertyId) {
          return res
            .status(400)
            .json({ error: "propertyId query is required" });
        }

        const filter = { propertyId };

        const reviews = await reviewsCollection
          .find(filter)
          .sort({ createdAt: -1 })
          .limit(4)
          .toArray();

        res.json(reviews);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch reviews" });
      }
    });

    // post review
    app.post("/reviews", async (req, res) => {
      try {
        const review = req.body;
        review.createdAt = new Date(); // optional: for sorting
        const result = await reviewsCollection.insertOne(review);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: "Failed to post review" });
      }
    });

    // get latest 4 reviews in reviews section
    app.get("/reviewSection", async (req, res) => {
      try {
        const { propertyId } = req.query;

        const filter = propertyId ? { propertyId } : {};

        const reviews = await reviewsCollection
          .find(filter)
          .sort({ createdAt: -1 })
          .limit(4)
          .toArray();

        res.json(reviews);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch reviews" });
      }
    });

    // GET single user reviews from my reviews
    app.get("/myReviews", async (req, res) => {
      const email = req.query.email;
      if (!email) return res.status(400).json({ error: "Email is required" });

      const reviews = await reviewsCollection
        .find({ userEmail: email })
        .sort({ createdAt: -1 })
        .toArray();
      res.json(reviews);
    });

    // GET allReviews
    app.get("/allReviews", async (req, res) => {
      try {
        const reviews = await reviewsCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();
        res.send(reviews);
      } catch (err) {
        console.error("Failed to fetch all reviews:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // DELETE single user reviews from my reviews
    app.delete("/myReviews/:id", async (req, res) => {
      const id = req.params.id;
      const result = await reviewsCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.json(result);
    });

    // post property to wishlist
    app.post("/wishlist", async (req, res) => {
      try {
        const wishlistItem = req.body;
        const result = await wishlistCollection.insertOne(wishlistItem);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: "Failed to add to wishlist" });
      }
    });

    // get all wish list on wishList page
    app.get("/wishlist", async (req, res) => {
      try {
        const email = req.query.email;

        if (!email) {
          return res
            .status(400)
            .json({ error: "Email query parameter is required" });
        }

        const wishlistItems = await wishlistCollection
          .find({ userEmail: email })
          .sort({ _id: -1 })
          .toArray();

        res.json(wishlistItems);
      } catch (error) {
        console.error("Failed to fetch wishlist:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    // get offered property on make offer page
    app.get("/offered/:id", async (req, res) => {
      try {
        const { id } = req.params;

        const property = await wishlistCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!property) {
          return res.status(404).json({ error: "Property not found" });
        }

        res.json(property);
      } catch (error) {
        console.error("Error fetching property by ID:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // stats card apis
    // admin stats card get api
    app.get("/api/admin-stats", async (req, res) => {
      try {
        const totalUsers = await usersCollection.estimatedDocumentCount();
        const totalVerifiedProperties =
          await propertiesCollection.countDocuments({ status: "verified" });
        const totalPendingProperties =
          await propertiesCollection.countDocuments({ status: "available" });
        const totalRejectedProperties =
          await propertiesCollection.countDocuments({ status: "rejected" });
        const totalReviews = await reviewsCollection.estimatedDocumentCount();
        const totalVerifiedAgents = await usersCollection.countDocuments({
          role: "agent",
        });

        res.json({
          totalUsers,
          totalVerifiedProperties,
          totalPendingProperties,
          totalRejectedProperties,
          totalReviews,
          totalVerifiedAgents,
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to load admin stats" });
      }
    });

    // agent stats card get api
    app.get("/api/agent-stats", async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) return res.status(400).json({ error: "Email is required" });

        const myAdded = await propertiesCollection.countDocuments({
          agentEmail: email,
        });
        const VerifiedProperties = await propertiesCollection.countDocuments({
          status: "verified",
        });
        const mySold = await propertiesCollection.countDocuments({
          agentEmail: email,
          status: "sold",
        });
        const unVerified = await propertiesCollection.countDocuments({
          agentEmail: email,
          status: "available",
        });
        const requested = await propertiesCollection.countDocuments({
          agentEmail: email,
          status: "",
        });
        const rejected = await propertiesCollection.countDocuments({
          agentEmail: email,
          status: "rejected",
        });

        res.json({
          myAdded,
          VerifiedProperties,
          mySold,
          unVerified,
          requested,
          rejected,
        });
      } catch (err) {
        console.error("Agent Stats Error", err);
        res.status(500).json({ error: "Failed to fetch agent stats" });
      }
    });

    // user stats card get api
    app.get("/api/user-stats", async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) {
          return res.status(400).json({ error: "Email is required" });
        }

        const wishlistCount = await wishlistCollection.countDocuments({
          userEmail: email,
        });

        const reviewCount = await reviewsCollection.countDocuments({
          userEmail: email,
        });

        // const boughtCount = await offersCollection.countDocuments({
        //   buyerEmail: email,
        //   status: "accepted",
        // });

        res.json({
          wishlist: wishlistCount,
          reviews: reviewCount,
          // bought: boughtCount,
        });
      } catch (err) {
        console.error("Failed to get user stats", err);
        res.status(500).json({ error: "Server error" });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// Simple root route
app.get("/", (req, res) => {
  res.send("BrickBase Server is running");
});

// Start the server
app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
